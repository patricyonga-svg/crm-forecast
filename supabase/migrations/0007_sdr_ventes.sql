-- Rôle « Commercial - SDR » et objectifs de prospection, plus quatre ajouts côté ventes :
-- SDR de l'affaire, devis joint, date prévisionnelle d'encaissement, rendez-vous marqué comme effectué.
-- Tout est additif : les affaires, objectifs et rapports existants ne changent pas.

-- Rôle SDR : mêmes droits qu'un commercial (AE), avec des objectifs de prospection en plus.
-- La nouvelle valeur n'est comparée qu'en texte ci-dessous, ce qui permet de tout faire dans la même transaction.
alter type user_role add value if not exists 'sdr' after 'commercial';

-- Affaires ------------------------------------------------------------------------------

alter table deals add column if not exists sdr_id int references sales_reps(id);
alter table deals add column if not exists quote_file_path text;
alter table deals add column if not exists quote_file_name text;
alter table deals add column if not exists expected_payment_date date;
-- Date à laquelle le lead est devenu qualifié (passage de la prospection à « Opportunité » ou au-delà).
alter table deals add column if not exists qualified_at timestamptz;

create index if not exists deals_sdr_idx on deals (sdr_id);

create or replace function deal_set_qualified() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.qualified_at is null
     and new.stage::text not in ('a_contacter', 'prise_rdv', 'cr_rdv', 'perdu')
     and (tg_op = 'INSERT' or old.stage::text in ('a_contacter', 'prise_rdv', 'cr_rdv')) then
    new.qualified_at := now();
  end if;
  return new;
end $$;

revoke execute on function deal_set_qualified() from public, anon, authenticated;

drop trigger if exists deals_qualified on deals;
create trigger deals_qualified before insert or update of stage on deals for each row execute function deal_set_qualified();

-- Leads déjà passés de la prospection à l'opportunité avant cette migration (d'après le journal des modifications).
update deals d set qualified_at = q.at
from (
  select row_id::uuid as id, min(at) as at
  from audit_log
  where table_name = 'deals'
    and old_data->>'stage' in ('a_contacter', 'prise_rdv', 'cr_rdv')
    and new_data->>'stage' not in ('a_contacter', 'prise_rdv', 'cr_rdv', 'perdu')
  group by row_id
) q
where d.id = q.id and d.qualified_at is null;

-- Nouvelles colonnes exposées à la fin de la vue (pour garder la vue existante).
create or replace view deal_amounts with (security_invoker = true) as
select
  d.id, d.client_id, d.country_code, d.business_line_id, d.sales_rep_id, d.beneficiaries, d.quote_amount, d.stage,
  d.expected_close_date, d.closing_raw, d.next_action, d.next_action_date, d.sheet_row, d.created_at, d.updated_at, d.updated_by,
  case when d.stage in ('forecast', 'won_pending', 'won') then d.quote_amount else 0 end as forecast_amount,
  case when d.stage in ('won_pending', 'won') then d.quote_amount else 0 end as invoiced_amount,
  case
    when d.stage = 'won' then d.quote_amount
    else coalesce((select sum(p.amount) from payments p where p.deal_id = d.id), 0)
  end as collected_amount,
  case when d.expected_close_date is not null
    then 'T' || extract(quarter from d.expected_close_date) || ' ' || extract(year from d.expected_close_date)
  end as quarter_label,
  d.name,
  d.comment,
  d.cards_status,
  d.sdr_id,
  d.quote_file_path,
  d.quote_file_name,
  d.expected_payment_date,
  d.qualified_at
from deals d;

-- Rendez-vous effectué, avec son résultat (outcome).
alter table appointments add column if not exists done_at timestamptz;
alter table appointments add column if not exists done_by uuid references profiles(id);
alter table appointments add column if not exists outcome text;

-- Droits : le SDR a les droits d'un commercial ; un commercial ou un SDR modifie les affaires dont il est porteur ou SDR.
create or replace function can_edit_deal(d deals) returns boolean
language sql stable set search_path = public as $$
  select my_role() = 'admin'
      or (my_role() = 'manager' and d.country_code = my_country())
      or (my_role()::text in ('commercial', 'sdr') and (d.sales_rep_id in (select my_rep_ids()) or d.sdr_id in (select my_rep_ids())))
$$;

alter policy update_country on clients
  using (my_role() = 'admin' or (my_role()::text in ('manager', 'commercial', 'sdr') and country_code = my_country()))
  with check (my_role() = 'admin' or (my_role()::text in ('manager', 'commercial', 'sdr') and country_code = my_country()));

-- Objectifs de prospection par SDR et par mois ---------------------------------------------

create table if not exists sdr_objectives (
  sales_rep_id int not null references sales_reps(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  new_leads int not null default 0 check (new_leads >= 0),
  qualified_leads int not null default 0 check (qualified_leads >= 0),
  primary key (sales_rep_id, month)
);

alter table sdr_objectives enable row level security;

create policy read_sdr_objectives on sdr_objectives for select to authenticated
  using (my_role() in ('direction', 'admin') or rep_country(sales_rep_id) = my_country());
create policy write_sdr_objectives on sdr_objectives for all to authenticated
  using (my_role() = 'admin' or (my_role() = 'manager' and rep_country(sales_rep_id) = my_country()))
  with check (my_role() = 'admin' or (my_role() = 'manager' and rep_country(sales_rep_id) = my_country()));

-- Devis joints : espace de stockage privé « devis » -------------------------------------------
-- Envoi : tout utilisateur connecté sauf la direction. Lecture : celui qui a envoyé le fichier,
-- et tous ceux qui voient l'affaire à laquelle il est rattaché (les droits de l'affaire s'appliquent).

insert into storage.buckets (id, name, public, file_size_limit)
values ('devis', 'devis', false, 20971520)
on conflict (id) do nothing;

create policy devis_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'devis' and public.my_role()::text <> 'direction');
create policy devis_read on storage.objects for select to authenticated
  using (bucket_id = 'devis' and (owner_id = auth.uid()::text or exists (select 1 from public.deals d where d.quote_file_path = objects.name)));
