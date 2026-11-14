-- Clients Premium : marque posée sur le client, ses affaires en héritent. Additif.
-- Seuls les administrateurs et les managers peuvent poser ou retirer la marque.

alter table clients add column if not exists is_premium boolean not null default false;
alter table clients add column if not exists premium_since timestamptz;
alter table clients add column if not exists premium_by uuid references profiles(id) on delete set null;

create index if not exists clients_premium_idx on clients (id) where is_premium;

create or replace function guard_client_premium() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not new.is_premium then
      return new;
    end if;
  elsif new.is_premium is not distinct from old.is_premium then
    -- Marque inchangée : on garde la date et l'auteur d'origine.
    new.premium_since := old.premium_since;
    new.premium_by := old.premium_by;
    return new;
  end if;
  -- auth.uid() est vide pour les imports et la console SQL : autorisé.
  if auth.uid() is not null and coalesce(my_role()::text, '') not in ('admin', 'manager') then
    raise exception 'Seuls les administrateurs et les managers peuvent marquer un client Premium.';
  end if;
  new.premium_since := case when new.is_premium then now() end;
  new.premium_by := case when new.is_premium then auth.uid() end;
  return new;
end $$;

drop trigger if exists clients_premium_guard on clients;
create trigger clients_premium_guard before insert or update on clients
  for each row execute function guard_client_premium();
