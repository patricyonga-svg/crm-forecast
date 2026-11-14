// Historique des affaires, reconstruit à partir du journal des modifications (table audit_log).
// Chaque création ou modification d'une affaire y est enregistrée depuis l'import du 20 octobre 2026 :
// on peut donc retrouver l'état du pipe à n'importe quelle date depuis, sans instantanés.
import { addDays, LEAD_STAGES, type Stage } from "./domain";
import type { ReportDeal } from "./reports";

export type DealState = {
  stage: Stage;
  quote_amount: number;
  expected_close_date: string | null;
  sales_rep_id: number | null;
  country_code: string;
  client_id: string;
};

export type HistoryEvent = { deal_id: string; at: string; action: "INSERT" | "UPDATE" | "DELETE"; state: DealState | null };

/** Ligne brute lue dans audit_log (champs extraits de new_data, tous en texte). */
export type AuditRow = {
  row_id: string;
  action: string;
  at: string;
  stage: string | null;
  quote_amount: string | null;
  expected_close_date: string | null;
  sales_rep_id: string | null;
  country_code: string | null;
  client_id: string | null;
};

export function toEvent(r: AuditRow): HistoryEvent {
  const action = r.action === "INSERT" || r.action === "DELETE" ? r.action : "UPDATE";
  return {
    deal_id: r.row_id,
    at: r.at,
    action,
    state:
      action === "DELETE" || !r.stage
        ? null
        : {
            stage: r.stage as Stage,
            quote_amount: Number(r.quote_amount ?? 0),
            expected_close_date: r.expected_close_date || null,
            sales_rep_id: r.sales_rep_id ? Number(r.sales_rep_id) : null,
            country_code: r.country_code ?? "",
            client_id: r.client_id ?? "",
          },
  };
}

/** Événements regroupés par affaire, dans l'ordre chronologique. */
export function timeline(events: HistoryEvent[]): Map<string, HistoryEvent[]> {
  const map = new Map<string, HistoryEvent[]>();
  for (const e of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const list = map.get(e.deal_id) ?? [];
    list.push(e);
    map.set(e.deal_id, list);
  }
  return map;
}

/** État de chaque affaire existant à l'instant `at` (affaires supprimées ou pas encore créées exclues). */
export function stateAt(tl: Map<string, HistoryEvent[]>, at: string): Map<string, DealState> {
  const t = Date.parse(at);
  const out = new Map<string, DealState>();
  for (const [id, events] of tl) {
    let state: DealState | null = null;
    for (const e of events) {
      if (Date.parse(e.at) > t) break;
      state = e.state;
    }
    if (state) out.set(id, state);
  }
  return out;
}

export function toReportDeal(s: DealState): ReportDeal {
  const won = s.stage === "won_pending" || s.stage === "won";
  return {
    country_code: s.country_code,
    sales_rep_id: s.sales_rep_id,
    stage: s.stage,
    expected_close_date: s.expected_close_date,
    quote_amount: s.quote_amount,
    forecast_amount: won || s.stage === "forecast" ? s.quote_amount : 0,
    invoiced_amount: won ? s.quote_amount : 0,
  };
}

/** Date depuis laquelle l'affaire est à son étape actuelle (premier événement de la dernière série à cette étape). */
export function stageSince(events: HistoryEvent[]): { since: string; fromFirstEvent: boolean } | null {
  const last = events.at(-1);
  if (!last?.state) return null;
  let i = events.length - 1;
  while (i > 0 && events[i - 1].state?.stage === last.state.stage) i--;
  return { since: events[i].at, fromFirstEvent: i === 0 };
}

/** Premier passage en Won Pending ou Won (facturation), après la création de l'affaire. */
export function wonAt(events: HistoryEvent[]): string | null {
  for (let i = 1; i < events.length; i++) {
    const s = events[i].state?.stage;
    const before = events[i - 1].state?.stage;
    if ((s === "won_pending" || s === "won") && before !== "won_pending" && before !== "won") return events[i].at;
  }
  return null;
}

/** Premier passage en Won (encaissement complet). */
export function fullyCollectedAt(events: HistoryEvent[]): string | null {
  for (let i = 1; i < events.length; i++) {
    if (events[i].state?.stage === "won" && events[i - 1].state?.stage !== "won") return events[i].at;
  }
  return null;
}

// Mouvements du pipe --------------------------------------------------------------------------

/** Pipe ouvert : affaires en cours de négociation, quelle que soit leur date de closing. */
export const OPEN_PIPE: Stage[] = ["opportunite", "a_relancer", "forecast"];

export const MOVE_KINDS = [
  { key: "nouvelles", label: "Nouvelles affaires", sign: 1 },
  { key: "reouvertes", label: "Réouvertes", sign: 1 },
  { key: "hausses", label: "Montants revus à la hausse", sign: 1 },
  { key: "baisses", label: "Montants revus à la baisse", sign: -1 },
  { key: "gagnees", label: "Gagnées (facturées)", sign: -1 },
  { key: "perdues", label: "Perdues", sign: -1 },
  { key: "autres", label: "Autres sorties", sign: -1 },
] as const;

export type MoveKind = (typeof MOVE_KINDS)[number]["key"];
export type Moves = {
  start: number;
  end: number;
  kinds: Record<MoveKind, { amount: number; deals: { id: string; amount: number }[] }>;
};

/**
 * Passage du pipe ouvert de `start` à `end`, affaire par affaire. La somme des mouvements
 * redonne exactement l'écart : début + mouvements = fin.
 * « Autres » regroupe les retours en prospection, les suppressions et les changements de commercial ou de pays
 * qui font sortir l'affaire du filtre (montant signé : une entrée par réattribution compte en positif).
 */
export function pipeMoves(start: Map<string, DealState>, end: Map<string, DealState>, keep: (s: DealState) => boolean = () => true): Moves {
  const open = (s: DealState | undefined) => (s && OPEN_PIPE.includes(s.stage) && keep(s) ? s : undefined);
  const kinds = Object.fromEntries(MOVE_KINDS.map((k) => [k.key, { amount: 0, deals: [] as { id: string; amount: number }[] }])) as Moves["kinds"];
  const add = (k: MoveKind, id: string, amount: number) => {
    if (amount === 0) return;
    kinds[k].amount += amount;
    kinds[k].deals.push({ id, amount });
  };
  let startTotal = 0;
  let endTotal = 0;
  for (const id of new Set([...start.keys(), ...end.keys()])) {
    const s = open(start.get(id));
    const e = open(end.get(id));
    if (s) startTotal += s.quote_amount;
    if (e) endTotal += e.quote_amount;
    if (s && e) {
      const delta = e.quote_amount - s.quote_amount;
      add(delta > 0 ? "hausses" : "baisses", id, delta);
    } else if (s) {
      const after = end.get(id)?.stage;
      add(after === "won" || after === "won_pending" ? "gagnees" : after === "perdu" ? "perdues" : "autres", id, -s.quote_amount);
    } else if (e) {
      const before = start.get(id);
      if (!before || LEAD_STAGES.includes(before.stage)) add("nouvelles", id, e.quote_amount);
      else if (!OPEN_PIPE.includes(before.stage)) add("reouvertes", id, e.quote_amount);
      else add("autres", id, e.quote_amount);
    }
  }
  for (const k of MOVE_KINDS) kinds[k.key].deals.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { start: startTotal, end: endTotal, kinds };
}

// Évolution semaine par semaine ----------------------------------------------------------------

/** Points de la courbe : fin du jour de départ, chaque dimanche soir, puis maintenant (dates ISO, UTC). */
export function weeklyPoints(from: string, to: string, now: string): string[] {
  const end = Math.min(Date.parse(`${to}T23:59:59Z`), Date.parse(now));
  const first = Date.parse(`${from}T23:59:59Z`);
  if (first > end) return Date.parse(`${from}T00:00:00Z`) <= end ? [new Date(end).toISOString()] : [];
  const points = [first];
  let d = new Date(first);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7)); // dimanche suivant
  while (d.getTime() < end) {
    points.push(d.getTime());
    d = new Date(d.getTime() + 7 * 86_400_000);
  }
  if (points.at(-1)! < end) points.push(end);
  return points.map((t) => new Date(t).toISOString());
}

// Encaissements --------------------------------------------------------------------------------

export type CollectionDeal = {
  id: string;
  stage: Stage;
  quote_amount: number;
  collected_amount: number;
  expected_close_date: string | null;
  expected_payment_date: string | null;
};

/** Date prévue d'encaissement : celle saisie, sinon 30 jours après la date de closing. */
export function dueDate(d: Pick<CollectionDeal, "expected_close_date" | "expected_payment_date">): string | null {
  return d.expected_payment_date ?? (d.expected_close_date ? addDays(d.expected_close_date, 30) : null);
}

export type MonthBucket = { month: string; collected: number; late: number; due: number; forecast: number };

/**
 * Encaissements par mois : encaissé (paiements saisis, et solde des affaires passées en Won), reste à encaisser
 * des Won Pending à leur date prévue (en retard si elle est passée), et forecast pas encore facturé.
 */
export function collectionMonths(
  months: string[],
  deals: CollectionDeal[],
  payments: { deal_id: string; paid_on: string; amount: number }[],
  wonDates: Map<string, string>,
  today: string,
): { buckets: MonthBucket[]; undated: { count: number; amount: number } } {
  const buckets = months.map((m) => ({ month: m, collected: 0, late: 0, due: 0, forecast: 0 }));
  const bucket = (date: string) => buckets.find((b) => b.month === `${date.slice(0, 7)}-01`);
  const ids = new Set(deals.map((d) => d.id));
  const paid = new Map<string, number>();
  for (const p of payments) {
    if (!ids.has(p.deal_id)) continue;
    paid.set(p.deal_id, (paid.get(p.deal_id) ?? 0) + Number(p.amount));
    const b = bucket(p.paid_on);
    if (b) b.collected += Number(p.amount);
  }
  const undated = { count: 0, amount: 0 };
  for (const d of deals) {
    if (d.stage === "won") {
      // Solde encaissé sans paiement saisi : compté à la date du passage en Won, si on la connaît.
      const rest = Number(d.quote_amount) - (paid.get(d.id) ?? 0);
      const at = wonDates.get(d.id);
      const b = at && bucket(at.slice(0, 10));
      if (b && rest > 0) b.collected += rest;
      continue;
    }
    if (d.stage !== "won_pending" && d.stage !== "forecast") continue;
    const rest = Number(d.quote_amount) - Number(d.collected_amount);
    if (rest <= 0) continue;
    const due = dueDate(d);
    if (!due) {
      if (d.stage === "won_pending") {
        undated.count++;
        undated.amount += rest;
      }
      continue;
    }
    // Les montants en retard restent dans le mois où ils étaient attendus.
    const b = bucket(due < months[0] ? months[0] : due);
    if (!b) continue;
    if (d.stage === "forecast") {
      // Forecast dont la date est passée : attendu au plus tôt ce mois-ci.
      const later = due < today ? bucket(today) : b;
      if (later) later.forecast += rest;
    } else if (due < today) b.late += rest;
    else b.due += rest;
  }
  return { buckets, undated };
}

// Transformation et cycle ----------------------------------------------------------------------

export type Conversion = { won: number; lost: number; wonAmount: number; lostAmount: number; rate: number | null; amountRate: number | null };

/** Taux de transformation : affaires gagnées sur affaires tranchées (gagnées + perdues), en nombre et en montant. */
export function conversion(deals: { stage: Stage; quote_amount: number }[]): Conversion {
  const won = deals.filter((d) => d.stage === "won" || d.stage === "won_pending");
  const lost = deals.filter((d) => d.stage === "perdu");
  const wonAmount = won.reduce((s, d) => s + Number(d.quote_amount), 0);
  const lostAmount = lost.reduce((s, d) => s + Number(d.quote_amount), 0);
  const n = won.length + lost.length;
  return {
    won: won.length,
    lost: lost.length,
    wonAmount,
    lostAmount,
    rate: n ? won.length / n : null,
    amountRate: wonAmount + lostAmount > 0 ? wonAmount / (wonAmount + lostAmount) : null,
  };
}

/** Durée en jours entre deux dates ISO. */
export const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
