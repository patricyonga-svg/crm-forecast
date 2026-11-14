// Suivi des comptes Premium : regroupement des affaires par client et état de santé du compte.
import { lateCollection, LEAD_STAGES, type Stage } from "./domain";

export type PremiumDeal = {
  id: string;
  client_id: string;
  name: string | null;
  stage: Stage;
  country_code: string;
  sales_rep_id: number | null;
  quote_amount: number;
  forecast_amount: number;
  invoiced_amount: number;
  collected_amount: number;
  expected_close_date: string | null;
  expected_payment_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
};

export type Health = "ok" | "warn" | "bad" | "idle";

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "Suivi à jour",
  warn: "À relancer",
  bad: "À reprendre en main",
  idle: "Aucune affaire en cours",
};

/** Nombre de jours sans contact au-delà duquel un compte Premium passe au rouge. */
export const STALE_DAYS = 30;

const CLOSED: Stage[] = ["won", "won_pending", "perdu"];
export const isOpen = (d: { stage: Stage }) => !CLOSED.includes(d.stage);

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export type Account = {
  id: string;
  name: string;
  country: string;
  deals: PremiumDeal[];
  open: PremiumDeal[];
  pipe: number; // devis des affaires ouvertes, hors prospection
  forecast: number; // affaires à l'étape Forecast
  invoiced: number; // facturé (Won Pending + Won), toutes dates
  collected: number;
  lastContact: string | null;
  next: { date: string | null; text: string; dealId: string } | null;
  issues: string[];
  health: Health;
};

/**
 * Regroupe les affaires d'un client Premium et calcule l'état du compte :
 * - rouge : affaires en cours mais aucune action prévue, ou plus de 30 jours sans contact ;
 * - orange : action en retard, closing dépassé ou encaissement en retard ;
 * - vert : le reste ; gris : aucune affaire en cours.
 */
export function account(
  client: { id: string; name: string; country_code: string },
  deals: PremiumDeal[],
  lastContact: string | null,
  today = new Date().toISOString().slice(0, 10),
): Account {
  const open = deals.filter(isOpen);
  const planned = open.filter((d) => d.next_action_date).sort((a, b) => a.next_action_date!.localeCompare(b.next_action_date!));
  const first = planned[0] ?? open.find((d) => d.next_action) ?? null;
  const issues: string[] = [];
  let health: Health = "ok";
  const overdue = planned.filter((d) => d.next_action_date! < today);
  const lateClose = open.filter((d) => d.expected_close_date && d.expected_close_date < today && !LEAD_STAGES.includes(d.stage));
  const lateCash = deals.filter((d) => lateCollection(d, today));
  if (open.length === 0) health = lateCash.length ? "warn" : "idle";
  if (overdue.length) issues.push(`${days(overdue[0].next_action_date!, today)} j de retard sur l'action`);
  if (lateClose.length) issues.push("Closing dépassé");
  if (lateCash.length) issues.push("Encaissement en retard");
  if (issues.length && health !== "idle") health = "warn";
  if (open.length && planned.length === 0) {
    issues.unshift("Aucune action prévue");
    health = "bad";
  }
  const since = lastContact ? days(lastContact, today) : null;
  if (open.length && (since === null || since > STALE_DAYS)) {
    issues.push(since === null ? "Aucun contact enregistré" : `${since} j sans contact`);
    health = "bad";
  }
  const sum = (ds: PremiumDeal[], pick: (d: PremiumDeal) => number) => ds.reduce((s, d) => s + Number(pick(d)), 0);
  return {
    id: client.id,
    name: client.name,
    country: client.country_code,
    deals,
    open,
    pipe: sum(open.filter((d) => !LEAD_STAGES.includes(d.stage)), (d) => d.quote_amount),
    forecast: sum(open.filter((d) => d.stage === "forecast"), (d) => d.quote_amount),
    invoiced: sum(deals, (d) => d.invoiced_amount),
    collected: sum(deals, (d) => d.collected_amount),
    lastContact,
    next: first ? { date: first.next_action_date, text: first.next_action ?? "Action prévue", dealId: first.id } : null,
    issues,
    health,
  };
}

const ORDER: Record<Health, number> = { bad: 0, warn: 1, ok: 2, idle: 3 };

/** Comptes à traiter d'abord, puis les plus gros pipes. */
export const byPriority = (a: Account, b: Account) => ORDER[a.health] - ORDER[b.health] || b.pipe - a.pipe || a.name.localeCompare(b.name);
