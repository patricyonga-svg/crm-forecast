-- Statut de livraison des cartes, obligatoire pour passer une affaire en « Won Pending ».
-- Livrées + encaissé < moitié du montant → rappel hebdomadaire au porteur (route /api/rappels-encaissement).

alter table deals add column if not exists cards_status text check (cards_status in ('livrees', 'non_livrees', 'desactivees'));

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
  d.cards_status
from deals d;
