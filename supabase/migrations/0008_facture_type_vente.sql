-- Type de vente (apporteur / interne) et facture jointe à l'affaire. Additif.

alter table deals add column if not exists sale_channel text check (sale_channel in ('apporteur', 'interne'));
alter table deals add column if not exists invoice_file_path text;
alter table deals add column if not exists invoice_file_name text;

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
  d.qualified_at,
  d.sale_channel,
  d.invoice_file_path,
  d.invoice_file_name
from deals d;

-- Les factures sont rangées dans le même espace privé que les devis : la lecture suit les droits de l'affaire.
alter policy devis_read on storage.objects
  using (bucket_id = 'devis' and (owner_id = auth.uid()::text or exists (
    select 1 from public.deals d where d.quote_file_path = objects.name or d.invoice_file_path = objects.name
  )));
