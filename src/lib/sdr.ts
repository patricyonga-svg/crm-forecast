// Calculs du rapport SDR : nouveaux leads, leads qualifiés et rendez-vous, par période.

export type SdrDeal = { sdr_id: number | null; country_code: string; created_at: string; qualified_at: string | null };
export type SdrObjective = { sales_rep_id: number; month: string; new_leads: number; qualified_leads: number };
export type SdrAppointment = {
  sales_rep_id: number;
  booked_by: string | null;
  created_at: string;
  starts_at: string;
  done_at: string | null;
  reported_at: string | null;
};

/** Jour (AAAA-MM-JJ) d'un horodatage. Les trois pays sont à UTC ou UTC+1 : le jour UTC suffit. */
export const day = (ts: string | null | undefined) => (ts ? ts.slice(0, 10) : null);

const within = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;

/** Nouveaux leads = affaires créées avec ce SDR ; leads qualifiés = affaires de ce SDR passées en Opportunité ou au-delà. */
export function leadCounts(deals: SdrDeal[], repId: number, from: string, to: string) {
  const mine = deals.filter((d) => d.sdr_id === repId);
  return {
    newLeads: mine.filter((d) => within(day(d.created_at), from, to)).length,
    qualified: mine.filter((d) => within(day(d.qualified_at), from, to)).length,
  };
}

export function sdrObjective(objectives: SdrObjective[], repId: number, months: string[]) {
  const os = objectives.filter((o) => o.sales_rep_id === repId && months.includes(o.month));
  return {
    newLeads: os.reduce((s, o) => s + Number(o.new_leads), 0),
    qualified: os.reduce((s, o) => s + Number(o.qualified_leads), 0),
  };
}

/** Saisie d'un objectif en nombre de leads : entier positif, vide = 0. */
export function parseCount(value: string): number {
  const n = Number(value.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Répartit un objectif trimestriel entier selon un phasage (en %), le dernier mois prenant l'arrondi. */
export function spreadCount(total: number, phasing: number[]): number[] {
  const sum = phasing.reduce((a, b) => a + b, 0) || 100;
  const parts = phasing.map((p) => Math.round((total * p) / sum));
  parts[parts.length - 1] = total - parts.slice(0, -1).reduce((a, b) => a + b, 0);
  return parts.map((p) => Math.max(0, p));
}

export type Granularity = "semaine" | "mois" | "trimestre";
export type Period = { key: string; label: string; from: string; to: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Les `count` dernières périodes (semaines du lundi au dimanche, mois ou trimestres civils), la plus récente en dernier. */
export function lastPeriods(granularity: Granularity, count: number, today = iso(new Date())): Period[] {
  const t = new Date(`${today}T00:00:00Z`);
  const out: Period[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (granularity === "semaine") {
      const monday = new Date(t);
      monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) - 7 * i);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      out.push({ key: iso(monday), label: `Sem. du ${DAY.format(monday)}`, from: iso(monday), to: iso(sunday) });
    } else if (granularity === "mois") {
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      out.push({ key: iso(start), label: MONTH.format(start), from: iso(start), to: iso(end) });
    } else {
      const q = Math.floor(t.getUTCMonth() / 3) - i;
      const start = new Date(Date.UTC(t.getUTCFullYear(), q * 3, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
      out.push({ key: iso(start), label: `T${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`, from: iso(start), to: iso(end) });
    }
  }
  return out;
}

/** Nombre d'éléments dont la date tombe dans chaque période. */
export function countByPeriod<T>(items: T[], date: (item: T) => string | null, periods: Period[]): number[] {
  return periods.map((p) => items.filter((i) => within(date(i), p.from, p.to)).length);
}

export const isDone = (a: Pick<SdrAppointment, "done_at" | "reported_at">) => !!(a.done_at || a.reported_at);
