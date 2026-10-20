export const STAGES = [
  { value: "opportunite", label: "Opportunité", help: "Devis envoyé, retour non négatif, closing dans les 6 mois" },
  { value: "forecast", label: "Forecast", help: "Devis validé, date de closing connue" },
  { value: "won_pending", label: "Won Pending", help: "Facturé, pas encore encaissé" },
  { value: "won", label: "Won", help: "Facturé et encaissé" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<Stage, string>;

export const STAGE_COLOR: Record<Stage, string> = {
  opportunite: "bg-zinc-100 text-zinc-700",
  forecast: "bg-blue-100 text-blue-800",
  won_pending: "bg-amber-100 text-amber-800",
  won: "bg-emerald-100 text-emerald-800",
};

export type Deal = {
  id: string;
  client_id: string;
  country_code: string;
  business_line_id: number | null;
  sales_rep_id: number | null;
  beneficiaries: number | null;
  quote_amount: number;
  stage: Stage;
  expected_close_date: string | null;
  closing_raw: string | null;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
  forecast_amount: number;
  invoiced_amount: number;
  collected_amount: number;
  quarter_label: string | null;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  country_code: string | null;
  role: "commercial" | "manager" | "direction" | "admin";
};

const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatMoney(value: number | null | undefined, currency = "XOF"): string {
  return `${money.format(Number(value ?? 0))} ${currency}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function percent(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)} %` : "—";
}

/** Premier et dernier jour d'un trimestre civil, « 2026-T4 ». */
export function quarterRange(value: string): { from: string; to: string; months: string[] } {
  const [y, q] = value.split("-T").map(Number);
  const start = (q - 1) * 3 + 1;
  const months = [0, 1, 2].map((i) => `${y}-${String(start + i).padStart(2, "0")}-01`);
  const lastDay = new Date(Date.UTC(y, start + 2, 0)).getUTCDate();
  return { from: months[0], to: `${y}-${String(start + 2).padStart(2, "0")}-${lastDay}`, months };
}

export function currentQuarter(today = new Date()): string {
  return `${today.getFullYear()}-T${Math.floor(today.getMonth() / 3) + 1}`;
}
