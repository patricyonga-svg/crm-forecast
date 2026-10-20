-- Schéma du CRM forecast.
-- Les montants Forecast / Facturé / Encaissé sont dérivés de l'étape, comme dans le fichier d'origine.

create type sales_stage as enum ('opportunite', 'forecast', 'won_pending', 'won');
create type user_role as enum ('commercial', 'manager', 'direction', 'admin');
create type activity_kind as enum ('note', 'appel', 'rdv', 'devis', 'relance');

-- Référentiels ---------------------------------------------------------------

create table countries (
  code text primary key,            -- 'SN', 'CI', 'CM'
  name text not null unique,
  currency text not null default 'XOF'
);

insert into countries (code, name, currency) values
  ('SN', 'Sénégal', 'XOF'),
  ('CI', 'Côte d''Ivoire', 'XOF'),
  ('CM', 'Cameroun', 'XOF');

create table business_lines (
  id serial primary key,
  name text not null unique,
  active boolean not null default true
);

create table business_line_countries (
  business_line_id int not null references business_lines(id) on delete cascade,
  country_code text not null references countries(code),
  primary key (business_line_id, country_code)
);

-- Utilisateurs ---------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  country_code text references countries(code),
  role user_role not null default 'commercial',
  initials text,                    -- ex. 'MSO', utilisé pour l'historique importé
  created_at timestamptz not null default now()
);

-- Commerciaux connus avant leur première connexion (import du Sheet).
-- Rattachés à un profil quand l'email correspond.
create table sales_reps (
  id serial primary key,
  display_name text not null unique,
  country_code text references countries(code),
  profile_id uuid references profiles(id) on delete set null,
  email text unique
);

-- Clients et affaires -------------------------------------------------------

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null references countries(code),
  kind text check (kind in ('entreprise', 'famille', 'particulier')),
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default now()
);

create index clients_name_idx on clients (country_code, lower(name));

create table deals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  country_code text not null references countries(code),
  business_line_id int references business_lines(id),
  sales_rep_id int references sales_reps(id),
  beneficiaries int check (beneficiaries >= 0),
  quote_amount numeric(14, 0) not null default 0 check (quote_amount >= 0),
  stage sales_stage not null default 'opportunite',
  expected_close_date date,
  closing_raw text,                 -- valeur d'origine du Sheet quand elle n'a pas pu être convertie
  next_action text,
  next_action_date date,
  sheet_row int,                    -- ligne d'origine dans l'onglet Detail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

create index deals_country_idx on deals (country_code, stage);
create index deals_rep_idx on deals (sales_rep_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  paid_on date not null,
  amount numeric(14, 0) not null check (amount > 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  kind activity_kind not null default 'note',
  body text not null,
  happened_on date not null default current_date,
  author_id uuid references profiles(id),
  author_label text,                -- initiales d'origine pour l'historique importé
  created_at timestamptz not null default now()
);

create index activities_deal_idx on activities (deal_id, happened_on desc);

create table objectives (
  country_code text not null references countries(code),
  business_line_id int not null references business_lines(id),
  month date not null check (extract(day from month) = 1),
  amount numeric(14, 0) not null check (amount >= 0),
  primary key (country_code, business_line_id, month)
);

-- Journal des modifications ---------------------------------------------------

create table audit_log (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);

create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id, old.id)::text,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create or replace function touch_deal() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger deals_touch before update on deals for each row execute function touch_deal();
create trigger deals_audit after insert or update or delete on deals for each row execute function log_change();
create trigger payments_audit after insert or update or delete on payments for each row execute function log_change();

-- Vue de calcul ---------------------------------------------------------------

create view deal_amounts with (security_invoker = true) as
select
  d.*,
  case when d.stage <> 'opportunite' then d.quote_amount else 0 end as forecast_amount,
  case when d.stage in ('won_pending', 'won') then d.quote_amount else 0 end as invoiced_amount,
  case
    when d.stage = 'won' then d.quote_amount
    else coalesce((select sum(p.amount) from payments p where p.deal_id = d.id), 0)
  end as collected_amount,
  case when d.expected_close_date is not null
    then 'T' || extract(quarter from d.expected_close_date) || ' ' || extract(year from d.expected_close_date)
  end as quarter_label
from deals d;

-- Droits d'accès --------------------------------------------------------------

create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_country() returns text
language sql stable security definer set search_path = public as $$
  select country_code from profiles where id = auth.uid()
$$;

create or replace function my_rep_ids() returns setof int
language sql stable security definer set search_path = public as $$
  select id from sales_reps where profile_id = auth.uid()
$$;

-- Peut modifier une affaire : admin, manager du pays, ou commercial porteur.
create or replace function can_edit_deal(d deals) returns boolean
language sql stable as $$
  select my_role() = 'admin'
      or (my_role() = 'manager' and d.country_code = my_country())
      or (my_role() = 'commercial' and d.sales_rep_id in (select my_rep_ids()))
$$;

alter table countries enable row level security;
alter table business_lines enable row level security;
alter table business_line_countries enable row level security;
alter table profiles enable row level security;
alter table sales_reps enable row level security;
alter table clients enable row level security;
alter table deals enable row level security;
alter table payments enable row level security;
alter table activities enable row level security;
alter table objectives enable row level security;
alter table audit_log enable row level security;

-- Référentiels : lecture pour tous les connectés, écriture admin.
create policy read_all on countries for select to authenticated using (true);
create policy read_all on business_lines for select to authenticated using (true);
create policy read_all on business_line_countries for select to authenticated using (true);
create policy read_all on sales_reps for select to authenticated using (true);
create policy read_all on profiles for select to authenticated using (true);
create policy admin_write on business_lines for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy admin_write on business_line_countries for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy admin_write on sales_reps for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy admin_write on profiles for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- Visibilité : direction et admin voient tout, les autres leur pays.
create policy read_country on clients for select to authenticated
  using (my_role() in ('direction', 'admin') or country_code = my_country());
create policy write_country on clients for insert to authenticated
  with check (my_role() = 'admin' or country_code = my_country());
create policy update_country on clients for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'manager' and country_code = my_country()));

create policy read_country on deals for select to authenticated
  using (my_role() in ('direction', 'admin') or country_code = my_country());
create policy insert_own on deals for insert to authenticated
  with check (my_role() = 'admin' or country_code = my_country());
create policy update_own on deals for update to authenticated
  using (can_edit_deal(deals)) with check (can_edit_deal(deals));
create policy delete_admin on deals for delete to authenticated
  using (my_role() in ('admin', 'manager') and (my_role() = 'admin' or country_code = my_country()));

create policy read_via_deal on payments for select to authenticated
  using (exists (select 1 from deals d where d.id = deal_id));
create policy write_via_deal on payments for all to authenticated
  using (exists (select 1 from deals d where d.id = deal_id and can_edit_deal(d)))
  with check (exists (select 1 from deals d where d.id = deal_id and can_edit_deal(d)));

create policy read_via_deal on activities for select to authenticated
  using (exists (select 1 from deals d where d.id = deal_id));
create policy insert_visible on activities for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from deals d where d.id = deal_id));

create policy read_objectives on objectives for select to authenticated
  using (my_role() in ('direction', 'admin') or country_code = my_country());
create policy write_objectives on objectives for all to authenticated
  using (my_role() = 'admin' or (my_role() = 'manager' and country_code = my_country()))
  with check (my_role() = 'admin' or (my_role() = 'manager' and country_code = my_country()));

create policy read_audit on audit_log for select to authenticated
  using (my_role() in ('admin', 'direction', 'manager'));

-- Création du profil à la première connexion Google.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  update sales_reps set profile_id = new.id where lower(email) = lower(new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
