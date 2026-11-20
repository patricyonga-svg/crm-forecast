import { getReferences, getSession } from "@/lib/session";
import { currentQuarter, quarterRange } from "@/lib/domain";
import { closingBetween, previousQuarter, type ReportDeal, type RepObjective, type Settings } from "@/lib/reports";

const DEAL_COLUMNS = "country_code, sales_rep_id, stage, expected_close_date, quote_amount, forecast_amount, invoiced_amount";

/** Données communes aux rapports d'un trimestre (filtrées par les droits de l'utilisateur). */
export async function loadQuarter(trimestre = currentQuarter()) {
  const { supabase, profile } = await getSession();
  const refs = await getReferences(supabase);
  const { from, to, months } = quarterRange(trimestre);
  const [{ data: deals }, { data: objectives }, { data: settings }] = await Promise.all([
    supabase
      .from("deal_amounts")
      .select(DEAL_COLUMNS)
      .or(closingBetween(quarterRange(previousQuarter(trimestre)).from, to))
      .returns<ReportDeal[]>(),
    supabase.from("rep_objectives").select("sales_rep_id, month, amount").gte("month", from).lte("month", to).returns<RepObjective[]>(),
    supabase.from("pipeline_settings").select("forecast_multiple, pipe_multiple").single<Settings>(),
  ]);
  return {
    supabase,
    profile,
    refs,
    trimestre,
    from,
    to,
    months,
    deals: deals ?? [],
    objectives: objectives ?? [],
    settings: { forecast_multiple: Number(settings?.forecast_multiple ?? 1), pipe_multiple: Number(settings?.pipe_multiple ?? 3) },
  };
}

export async function loadPeriod(from: string, to: string) {
  const { supabase, profile } = await getSession();
  const refs = await getReferences(supabase);
  const filter = closingBetween(from, to);
  const [{ data: deals }, { count: undated }] = await Promise.all([
    supabase.from("deal_amounts").select(DEAL_COLUMNS).or(filter).returns<ReportDeal[]>(),
    supabase.from("deals").select("id", { count: "exact", head: true }).is("expected_close_date", null),
  ]);
  // Les affaires sans date ne sont « hors période » que si la fin du trimestre en cours n'est pas dans la période.
  return { profile, refs, deals: deals ?? [], undated: filter.includes("is.null") ? 0 : (undated ?? 0) };
}

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long" });
export const monthLabel = (m: string) => MONTH.format(new Date(`${m}T00:00:00`));

/** Mois affiché : celui demandé, sinon le mois en cours s'il est dans le trimestre, sinon le premier. */
export function pickMonth(months: string[], requested?: string): string {
  if (requested && months.includes(requested)) return requested;
  const current = `${new Date().toISOString().slice(0, 7)}-01`;
  return months.includes(current) ? current : months[0];
}
