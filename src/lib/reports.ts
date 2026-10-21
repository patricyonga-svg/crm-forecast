// Calculs des rapports : réalisé vs objectif, couverture forecast / pipe, entonnoir.
import { quarterRange, type Stage } from "./domain";

export type ReportDeal = {
  country_code: string;
  sales_rep_id: number | null;
  stage: Stage;
  expected_close_date: string | null;
  quote_amount: number;
  forecast_amount: number;
  invoiced_amount: number;
};

export type Rep = { id: number; display_name: string; country_code: string | null; active?: boolean };
export type RepObjective = { sales_rep_id: number; month: string; amount: number };
export type Settings = { forecast_multiple: number; pipe_multiple: number };

export const COUNTRY_COLOR: Record<string, { strong: string; light: string }> = {
  CI: { strong: "#2a78d6", light: "#a9c4e6" },
  SN: { strong: "#eb6834", light: "#f7c3ac" },
  CM: { strong: "#1baf7a", light: "#a9e2cd" },
};

export const countryColor = (code: string) => COUNTRY_COLOR[code] ?? { strong: "#14213d", light: "#c9cfdb" };

export function previousQuarter(value: string): string {
  const [y, q] = value.split("-T").map(Number);
  return q === 1 ? `${y - 1}-T4` : `${y}-T${q - 1}`;
}

/**
 * Affaires prises en compte pour un trimestre : celles datées dans le trimestre,
 * plus les affaires encore ouvertes (Opportunité, Forecast) datées du trimestre précédent, en retard.
 */
export function inQuarter(d: ReportDeal, trimestre: string): boolean {
  const date = d.expected_close_date;
  if (!date) return false;
  const { from, to } = quarterRange(trimestre);
  if (date >= from && date <= to) return true;
  const late = quarterRange(previousQuarter(trimestre));
  return (d.stage === "opportunite" || d.stage === "forecast") && date >= late.from && date < from;
}

/** Réalisé = montant facturé (Won Pending + Won) des affaires dont la date de closing tombe dans [from, to]. */
export function realised(deals: ReportDeal[], from: string, to: string): number {
  return deals.filter((d) => d.expected_close_date && d.expected_close_date >= from && d.expected_close_date <= to).reduce((s, d) => s + Number(d.invoiced_amount), 0);
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Part écoulée d'une période (0 à 1) à la date du jour. */
export function elapsed(from: string, to: string, today = new Date().toISOString().slice(0, 10)): number {
  if (today < from) return 0;
  if (today > to) return 1;
  const day = 86_400_000;
  const start = Date.parse(from);
  return (Date.parse(today) - start + day) / (Date.parse(to) - start + day);
}

export type Coverage = {
  objective: number;
  done: number;
  forecast: number; // réalisé + affaires au stade Forecast
  pipe: number; // toutes les affaires de la période (montant des devis)
  forecastNeeded: number;
  pipeNeeded: number;
};

export function coverage(deals: ReportDeal[], objective: number, trimestre: string, settings: Settings): Coverage {
  const { from, to } = quarterRange(trimestre);
  const scoped = deals.filter((d) => inQuarter(d, trimestre));
  const forecastNeeded = objective * Number(settings.forecast_multiple);
  return {
    objective,
    done: realised(deals, from, to),
    forecast: scoped.reduce((s, d) => s + Number(d.forecast_amount), 0),
    pipe: scoped.reduce((s, d) => s + Number(d.quote_amount), 0),
    forecastNeeded,
    pipeNeeded: forecastNeeded * Number(settings.pipe_multiple),
  };
}

export const FUNNEL_LEVELS: { label: string; stages: Stage[] }[] = [
  { label: "Opportunité", stages: ["opportunite", "forecast", "won_pending", "won"] },
  { label: "Forecast", stages: ["forecast", "won_pending", "won"] },
  { label: "Won Pending", stages: ["won_pending", "won"] },
  { label: "Won", stages: ["won"] },
];

/** Entonnoir cumulé : chaque niveau contient les affaires arrivées au moins à cette étape. */
export function funnel(deals: ReportDeal[]) {
  return FUNNEL_LEVELS.map((level) => {
    const ds = deals.filter((d) => level.stages.includes(d.stage));
    return { label: level.label, count: ds.length, amount: ds.reduce((s, d) => s + Number(d.quote_amount), 0) };
  });
}

export type Group = { code: string; name: string; reps: { id: number | null; name: string; deals: ReportDeal[]; objectives: RepObjective[] }[] };

/** Regroupe par pays puis par commercial ; les affaires sans commercial forment une ligne à part. */
export function groupByCountry(
  countries: { code: string; name: string }[],
  reps: Rep[],
  deals: ReportDeal[],
  objectives: RepObjective[],
): Group[] {
  return countries
    .map((c) => {
      const countryReps = reps.filter((r) => r.country_code === c.code);
      const ids = new Set(countryReps.map((r) => r.id));
      const rows = countryReps
        .map((r) => ({
          id: r.id as number | null,
          name: r.display_name,
          deals: deals.filter((d) => d.sales_rep_id === r.id),
          objectives: objectives.filter((o) => o.sales_rep_id === r.id),
          active: r.active !== false,
        }))
        .filter((r) => r.active || r.deals.length > 0 || r.objectives.some((o) => Number(o.amount) > 0));
      const orphans = deals.filter((d) => d.country_code === c.code && (d.sales_rep_id === null || !ids.has(d.sales_rep_id)));
      if (orphans.length) rows.push({ id: null, name: "Sans commercial", deals: orphans, objectives: [], active: true });
      return { code: c.code, name: c.name, reps: rows };
    })
    .filter((g) => g.reps.length > 0);
}

export const sumObjectives = (objectives: RepObjective[], months: string[]) =>
  objectives.filter((o) => months.includes(o.month)).reduce((s, o) => s + Number(o.amount), 0);

/**
 * Objectif saisi : en millions de XOF (« 45 », « 4,5 ») ou en montant complet (« 45 000 000 »).
 * Aucun objectif réel ne dépasse 100 000 M XOF ni ne descend sous 100 000 XOF : le seuil distingue les deux.
 */
export function parseObjective(value: string): number {
  const n = Number(value.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 100_000 ? Math.round(n) : Math.round(n * 1_000_000);
}

const millions = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Montant en millions, comme dans les présentations : « 20 M », « 9,4 M ». */
export function formatM(value: number): string {
  const m = value / 1_000_000;
  return `${millions.format(Math.abs(m) >= 10 ? Math.round(m) : m)} M`;
}

export function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

/** Couleur d'un taux d'atteinte, comparé à la part de la période écoulée. */
export function tone(rate: number | null, expected = 1): string {
  if (rate === null) return "text-zinc-400";
  if (rate >= expected) return "text-emerald-700";
  if (rate >= expected * 0.5) return "text-amber-600";
  return "text-red-700";
}
