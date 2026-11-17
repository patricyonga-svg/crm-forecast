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

/**
 * Avant l'import, le journal ne dit rien. Pour les affaires importées (premier événement le jour de l'import
 * ou avant), on considère qu'elles sont entrées dans leur statut d'import à leur date de closing, si celle-ci
 * est antérieure à l'import : on ajoute un événement fictif à cette date, avec l'état lu à l'import.
 * Les affaires sans date de closing, ou avec un closing postérieur, gardent l'import comme date d'entrée.
 */
export function backfillFromClosing(tl: Map<string, HistoryEvent[]>, importDay: string): Map<string, HistoryEvent[]> {
  const out = new Map<string, HistoryEvent[]>();
  for (const [id, events] of tl) {
    const first = events[0];
    const close = first?.state?.expected_close_date;
    if (first && first.at.slice(0, 10) <= importDay && close && close < first.at.slice(0, 10)) {
      out.set(id, [{ ...first, at: `${close}T00:00:00.000Z` }, ...events]);
    } else out.set(id, events);
  }
  return out;
}

/** Date du premier événement connu (réel ou reconstitué), au format AAAA-MM-JJ. */
export function earliestDay(tl: Map<string, HistoryEvent[]>): string | null {
  let min: string | null = null;
  for (const events of tl.values()) if (events[0] && (!min || events[0].at < min)) min = events[0].at;
  return min ? min.slice(0, 10) : null;
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

/** Durée en jours entre deux dates ISO. */
export const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));


// Pipe d'une période et ce qu'il est devenu --------------------------------------------------

export type Outcome = "gagnee" | "perdue" | "en_cours" | "sortie";
export type CohortDeal = { id: string; state: DealState; outcome: Outcome; enteredDuring: boolean };

/**
 * Pipe travaillé pendant une période : les affaires ouvertes (Opportunité, À relancer, Forecast) au début,
 * plus celles entrées dans le pipe, gagnées ou perdues pendant la période. Avec `closedSince` (période commencée
 * avant le début de l'historique), aussi celles déjà gagnées ou perdues au départ dont le closing date de `closedSince` ou après. Pour chacune, son état à la fin de la période :
 * gagnée (Won Pending ou Won), perdue, toujours en cours, ou sortie (retour en prospection, suppression).
 * Le montant et le commercial retenus sont ceux de la fin de la période (ou du dernier état connu).
 */
export function pipeCohort(tl: Map<string, HistoryEvent[]>, startAt: string, endAt: string, closedSince?: string): CohortDeal[] {
  const decided = (s: DealState | null) => !!s && (s.stage === "won" || s.stage === "won_pending" || s.stage === "perdu");
  const t0 = Date.parse(startAt);
  const t1 = Date.parse(endAt);
  const out: CohortDeal[] = [];
  for (const [id, events] of tl) {
    let atStart: DealState | null = null;
    let last: DealState | null = null;
    let lastKnown: DealState | null = null;
    let entered = false;
    for (const e of events) {
      const t = Date.parse(e.at);
      if (t > t1) break;
      if (t <= t0) atStart = e.state;
      // Entrée dans le pipe, ou affaire gagnée / perdue pendant la période (même saisie directement à ce stade).
      else if (e.state && (OPEN_PIPE.includes(e.state.stage) || (decided(e.state) && !decided(last)))) entered = true;
      last = e.state;
      if (e.state) lastKnown = e.state;
    }
    const openAtStart = !!atStart && OPEN_PIPE.includes(atStart.stage);
    // Période commencée avant l'historique : les affaires déjà gagnées ou perdues à l'import,
    // avec une date de closing dans la période, ont été tranchées pendant la période.
    const closedBefore = !!closedSince && decided(atStart) && !!atStart!.expected_close_date && atStart!.expected_close_date >= closedSince;
    if (!openAtStart && !entered && !closedBefore) continue;
    const state = last ?? lastKnown!;
    const outcome: Outcome = !last
      ? "sortie"
      : last.stage === "won" || last.stage === "won_pending"
        ? "gagnee"
        : last.stage === "perdu"
          ? "perdue"
          : OPEN_PIPE.includes(last.stage)
            ? "en_cours"
            : "sortie";
    out.push({ id, state, outcome, enteredDuring: !openAtStart });
  }
  return out;
}

export type CohortStats = { count: number; amount: number; won: number; wonAmount: number; lost: number; lostAmount: number; open: number; openAmount: number; out: number; outAmount: number };

export function cohortStats(deals: CohortDeal[]): CohortStats {
  const s: CohortStats = { count: 0, amount: 0, won: 0, wonAmount: 0, lost: 0, lostAmount: 0, open: 0, openAmount: 0, out: 0, outAmount: 0 };
  for (const d of deals) {
    const a = d.state.quote_amount;
    s.count++;
    s.amount += a;
    const [n, m] = ({ gagnee: ["won", "wonAmount"], perdue: ["lost", "lostAmount"], en_cours: ["open", "openAmount"], sortie: ["out", "outAmount"] } as const)[d.outcome];
    s[n]++;
    s[m] += a;
  }
  return s;
}
