-- Objectifs mensuels par commercial et paramètres de suivi du pipeline (rapports).

alter table sales_reps add column active boolean not null default true;

create table rep_objectives (
  sales_rep_id int not null references sales_reps(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(14, 0) not null check (amount >= 0),
  primary key (sales_rep_id, month)
);

alter table rep_objectives enable row level security;

create or replace function rep_country(rep_id int) returns text
language sql stable security definer set search_path = public as $$
  select country_code from sales_reps where id = rep_id
$$;

revoke execute on function rep_country(int) from public, anon;
grant execute on function rep_country(int) to authenticated;

create policy read_rep_objectives on rep_objectives for select to authenticated
  using (my_role() in ('direction', 'admin') or rep_country(sales_rep_id) = my_country());
create policy write_rep_objectives on rep_objectives for all to authenticated
  using (my_role() = 'admin' or (my_role() = 'manager' and rep_country(sales_rep_id) = my_country()))
  with check (my_role() = 'admin' or (my_role() = 'manager' and rep_country(sales_rep_id) = my_country()));

-- Une seule ligne : multiples de couverture de l'objectif.
create table pipeline_settings (
  id boolean primary key default true check (id),
  forecast_multiple numeric(4, 2) not null default 1 check (forecast_multiple > 0),
  pipe_multiple numeric(4, 2) not null default 3 check (pipe_multiple > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) default auth.uid()
);

insert into pipeline_settings default values;

alter table pipeline_settings enable row level security;

create policy read_all on pipeline_settings for select to authenticated using (true);
create policy admin_write on pipeline_settings for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
