-- Entreprises enrichies, contacts, rendez-vous et trois étapes de prospection avant « Opportunité » :
-- À contacter → Prise de rendez-vous → CR de rendez-vous → Opportunité → …
-- Tout est additif : les affaires existantes et les rapports ne changent pas.

alter type sales_stage add value if not exists 'a_contacter' before 'opportunite';
alter type sales_stage add value if not exists 'prise_rdv' before 'opportunite';
alter type sales_stage add value if not exists 'cr_rdv' before 'opportunite';

-- Affaires : un nom et un commentaire (le nom du client reste affiché quand le nom est vide).
alter table deals add column if not exists name text;
alter table deals add column if not exists comment text;

-- La vue des montants doit exposer les nouvelles colonnes (ajoutées à la fin pour garder la vue existante).
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
  d.comment
from deals d;

-- Entreprises : secteur, effectif, contact principal.
alter table clients add column if not exists sector text;
alter table clients add column if not exists headcount int check (headcount >= 0);
alter table clients add column if not exists primary_contact_id uuid;

-- Contacts -------------------------------------------------------------------

create table contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  last_name text not null check (btrim(last_name) <> ''),
  first_name text,
  job_title text,
  is_decision_maker boolean,
  email text,
  phone text,
  comment text,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index contacts_client_idx on contacts (client_id);

alter table clients add constraint clients_primary_contact_fk foreign key (primary_contact_id) references contacts(id) on delete set null;

-- Contacts suivis sur une affaire (ils appartiennent toujours à l'entreprise de l'affaire).
create table deal_contacts (
  deal_id uuid not null references deals(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deal_id, contact_id)
);

create index deal_contacts_contact_idx on deal_contacts (contact_id);

-- Rendez-vous ------------------------------------------------------------------

create table appointments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  sales_rep_id int not null references sales_reps(id),
  contact_id uuid references contacts(id) on delete set null,
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  location text,
  notes text,
  booked_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  email_status text,
  -- Compte rendu
  report_contact_id uuid references contacts(id) on delete set null,
  report_decision_maker boolean,
  report_need boolean,
  report_budget boolean,
  report_close_date date,
  report_notes text,
  reported_at timestamptz,
  reported_by uuid references profiles(id)
);

create index appointments_deal_idx on appointments (deal_id, starts_at desc);
create index appointments_rep_idx on appointments (sales_rep_id, starts_at);

-- Automatismes -------------------------------------------------------------------

-- Le premier contact d'une entreprise en devient le contact principal.
create or replace function contact_set_primary() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update clients set primary_contact_id = new.id where id = new.client_id and primary_contact_id is null;
  return new;
end $$;

create trigger contacts_primary after insert on contacts for each row execute function contact_set_primary();

-- Rendez-vous pris : l'affaire passe en « Prise de rendez-vous » (si elle était « À contacter »),
-- reçoit le commercial s'il n'y en avait pas, et le contact du rendez-vous est rattaché à l'affaire.
-- Compte rendu saisi : l'affaire passe en « CR de rendez-vous », reçoit l'échéance de closing,
-- le contact rencontré est rattaché à l'affaire et marqué décideur ou non.
create or replace function appointment_sync_deal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update deals set
      stage = case when stage::text = 'a_contacter' then 'prise_rdv'::sales_stage else stage end,
      sales_rep_id = coalesce(sales_rep_id, new.sales_rep_id)
    where id = new.deal_id;
    if new.contact_id is not null then
      insert into deal_contacts (deal_id, contact_id) values (new.deal_id, new.contact_id) on conflict do nothing;
    end if;
  elsif new.reported_at is not null and old.reported_at is null then
    update deals set
      stage = case when stage::text in ('a_contacter', 'prise_rdv') then 'cr_rdv'::sales_stage else stage end,
      expected_close_date = coalesce(new.report_close_date, expected_close_date)
    where id = new.deal_id;
    if new.report_contact_id is not null then
      insert into deal_contacts (deal_id, contact_id) values (new.deal_id, new.report_contact_id) on conflict do nothing;
      if new.report_decision_maker is not null then
        update contacts set is_decision_maker = new.report_decision_maker where id = new.report_contact_id;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger appointments_sync after insert or update on appointments for each row execute function appointment_sync_deal();

create trigger contacts_audit after insert or update or delete on contacts for each row execute function log_change();
create trigger appointments_audit after insert or update or delete on appointments for each row execute function log_change();

revoke execute on function contact_set_primary() from public, anon, authenticated;
revoke execute on function appointment_sync_deal() from public, anon, authenticated;

-- Droits d'accès ---------------------------------------------------------------------

-- Les commerciaux peuvent compléter les entreprises de leur pays (secteur, effectif, contact principal).
alter policy update_country on clients
  using (my_role() = 'admin' or (my_role() in ('manager', 'commercial') and country_code = my_country()))
  with check (my_role() = 'admin' or (my_role() in ('manager', 'commercial') and country_code = my_country()));

alter table contacts enable row level security;
alter table deal_contacts enable row level security;
alter table appointments enable row level security;

-- Contacts : visibles avec leur entreprise ; ajoutés et modifiés par tous sauf la direction.
create policy read_via_client on contacts for select to authenticated
  using (exists (select 1 from clients c where c.id = client_id));
create policy insert_via_client on contacts for insert to authenticated
  with check (my_role() <> 'direction' and exists (select 1 from clients c where c.id = client_id and (my_role() = 'admin' or c.country_code = my_country())));
create policy update_via_client on contacts for update to authenticated
  using (my_role() <> 'direction' and exists (select 1 from clients c where c.id = client_id and (my_role() = 'admin' or c.country_code = my_country())))
  with check (my_role() <> 'direction' and exists (select 1 from clients c where c.id = client_id and (my_role() = 'admin' or c.country_code = my_country())));
create policy delete_contacts on contacts for delete to authenticated
  using (my_role() = 'admin' or created_by = auth.uid() or (my_role() = 'manager' and exists (select 1 from clients c where c.id = client_id and c.country_code = my_country())));

create policy read_via_deal on deal_contacts for select to authenticated
  using (exists (select 1 from deals d where d.id = deal_id));
create policy write_via_deal on deal_contacts for all to authenticated
  using (my_role() <> 'direction' and exists (select 1 from deals d where d.id = deal_id))
  with check (my_role() <> 'direction' and exists (select 1 from deals d where d.id = deal_id));

-- Rendez-vous : tout le monde (sauf la direction) peut en prendre un pour un commercial sur une affaire visible ;
-- le preneur, le commercial concerné et ceux qui peuvent modifier l'affaire peuvent le modifier.
create policy read_via_deal on appointments for select to authenticated
  using (exists (select 1 from deals d where d.id = deal_id));
create policy insert_booked on appointments for insert to authenticated
  with check (my_role() <> 'direction' and booked_by = auth.uid() and exists (select 1 from deals d where d.id = deal_id));
create policy update_involved on appointments for update to authenticated
  using (my_role() <> 'direction' and (booked_by = auth.uid() or sales_rep_id in (select my_rep_ids()) or exists (select 1 from deals d where d.id = deal_id and can_edit_deal(d))))
  with check (my_role() <> 'direction' and exists (select 1 from deals d where d.id = deal_id));
create policy delete_involved on appointments for delete to authenticated
  using (my_role() <> 'direction' and (booked_by = auth.uid() or exists (select 1 from deals d where d.id = deal_id and can_edit_deal(d))));
