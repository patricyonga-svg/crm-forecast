-- Une affaire en « Won Pending » ou « Won » ne peut revenir à une étape antérieure
-- (ni passer en À relancer / Perdu) que par un administrateur. Won Pending → Won reste libre.
-- Les traitements serveur sans utilisateur connecté (SQL Editor, tâches planifiées) ne sont pas bloqués.
create or replace function deal_lock_won() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.stage::text in ('won_pending', 'won')
     and new.stage is distinct from old.stage
     and not (old.stage::text = 'won_pending' and new.stage::text = 'won')
     and auth.uid() is not null
     and coalesce(my_role()::text, '') <> 'admin' then
    raise exception 'Une affaire en « Won Pending » ou « Won » ne peut revenir à une étape antérieure que par un administrateur.'
      using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function deal_lock_won() from public, anon, authenticated;

drop trigger if exists deals_lock_won on deals;
create trigger deals_lock_won before update of stage on deals for each row execute function deal_lock_won();
