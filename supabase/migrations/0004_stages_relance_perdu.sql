-- Deux étapes de plus : « À relancer » (affaire ouverte, en attente du client) et « Perdu ».
-- Ni l'une ni l'autre ne compte dans le forecast ; seule « Perdu » sort du pipe (géré dans les rapports).

alter type sales_stage add value if not exists 'a_relancer' after 'opportunite';
alter type sales_stage add value if not exists 'perdu';

create or replace view deal_amounts with (security_invoker = true) as
select
  d.*,
  case when d.stage in ('forecast', 'won_pending', 'won') then d.quote_amount else 0 end as forecast_amount,
  case when d.stage in ('won_pending', 'won') then d.quote_amount else 0 end as invoiced_amount,
  case
    when d.stage = 'won' then d.quote_amount
    else coalesce((select sum(p.amount) from payments p where p.deal_id = d.id), 0)
  end as collected_amount,
  case when d.expected_close_date is not null
    then 'T' || extract(quarter from d.expected_close_date) || ' ' || extract(year from d.expected_close_date)
  end as quarter_label
from deals d;
