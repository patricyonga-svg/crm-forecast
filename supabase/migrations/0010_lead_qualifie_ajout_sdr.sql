-- Lead qualifié : une affaire déjà en Opportunité ou au-delà compte aussi comme qualifiée
-- au moment où l'on renseigne son SDR (correction a posteriori d'une affaire).
create or replace function deal_set_qualified() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.qualified_at is null
     and new.stage::text not in ('a_contacter', 'prise_rdv', 'cr_rdv', 'perdu')
     and (
       tg_op = 'INSERT'
       or old.stage::text in ('a_contacter', 'prise_rdv', 'cr_rdv')
       or (old.sdr_id is null and new.sdr_id is not null)
     ) then
    new.qualified_at := now();
  end if;
  return new;
end $$;

revoke execute on function deal_set_qualified() from public, anon, authenticated;

drop trigger if exists deals_qualified on deals;
create trigger deals_qualified before insert or update of stage, sdr_id on deals for each row execute function deal_set_qualified();

-- Affaires existantes : SDR ajouté alors que l'affaire était déjà avancée → qualifiée à la date d'ajout du SDR
-- (d'après le journal des modifications, sinon à la date de création).
update deals d set qualified_at = coalesce(
  (select min(a.at) from audit_log a
    where a.table_name = 'deals' and a.row_id = d.id::text and a.old_data is not null
      and a.old_data->>'sdr_id' is null and a.new_data->>'sdr_id' is not null),
  d.created_at)
where d.qualified_at is null
  and d.sdr_id is not null
  and d.stage::text not in ('a_contacter', 'prise_rdv', 'cr_rdv', 'perdu');
