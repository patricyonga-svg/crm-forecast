// Données des rapports historiques (évolution, mouvements, encaissements, stagnation, transformation).
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getReferences, getSession } from "@/lib/session";
import { currentQuarter, quarterRange, type Stage } from "@/lib/domain";
import { monthEnd } from "@/lib/reports";
import { timeline, toEvent, type AuditRow, type DealState } from "@/lib/history";

export type Param = string | string[] | undefined;
export const list = (p: Param): string[] => [...new Set((Array.isArray(p) ? p : p ? [p] : []).filter(Boolean))];

export type HistoryDeal = {
  id: string;
  client_id: string;
  name: string | null;
  stage: Stage;
  country_code: string;
  sales_rep_id: number | null;
  quote_amount: number;
  collected_amount: number;
  expected_close_date: string | null;
  expected_payment_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
  updated_at: string;
  qualified_at: string | null;
  sheet_row: number | null;
};

const DEAL_COLUMNS =
  "id, client_id, name, stage, country_code, sales_rep_id, quote_amount, collected_amount, expected_close_date, expected_payment_date, next_action, next_action_date, created_at, updated_at, qualified_at, sheet_row";
const AUDIT_COLUMNS =
  "row_id, action, at, stage:new_data->>stage, quote_amount:new_data->>quote_amount, expected_close_date:new_data->>expected_close_date, sales_rep_id:new_data->>sales_rep_id, country_code:new_data->>country_code, client_id:new_data->>client_id";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Lit toutes les lignes d'une requête, par pages de 1 000 (limite de Supabase). */
async function all<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

type Search = { pays?: Param; porteur?: Param; premium?: Param };

/** Filtres communs : pays, commercial, Premium. */
export function parseFilters(params: Search) {
  const pays = list(params.pays);
  const porteurs = list(params.porteur).map(Number).filter(Number.isFinite);
  const premium = list(params.premium).includes("1");
  return { pays, porteurs, premium, active: pays.length > 0 || porteurs.length > 0 || premium };
}

/**
 * Affaires visibles par l'utilisateur, avec leur historique. Le journal des modifications n'est lisible
 * en base que par les managers, la direction et les admins : il est lu côté serveur avec la clé de service,
 * mais seulement pour les affaires que l'utilisateur voit déjà.
 */
export async function loadHistory(params: Search) {
  const { supabase, profile } = await getSession();
  const refs = await getReferences(supabase);
  const filters = parseFilters(params);

  const [deals, clients] = await Promise.all([
    all<HistoryDeal>((a, b) => supabase.from("deal_amounts").select(DEAL_COLUMNS).order("id").range(a, b).returns<HistoryDeal[]>()),
    all<{ id: string; name: string; is_premium: boolean }>((a, b) => supabase.from("clients").select("id, name, is_premium").order("id").range(a, b)),
  ]);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reader = key ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } }) : supabase;
  const readAudit = (client: typeof supabase) =>
    all<AuditRow>((a, b) => client.from("audit_log").select(AUDIT_COLUMNS).eq("table_name", "deals").order("id").range(a, b).returns<AuditRow[]>());
  // Clé de service invalide : on retombe sur les droits de l'utilisateur plutôt que de bloquer la page.
  const audit = await readAudit(reader as typeof supabase).catch(() => readAudit(supabase).catch(() => [] as AuditRow[]));

  const visible = new Set(deals.map((d) => d.id));
  const tl = timeline(audit.filter((r) => visible.has(r.row_id)).map(toEvent));
  const historyStart = audit.length ? audit.reduce((m, r) => (r.at < m ? r.at : m), audit[0].at) : null;

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const premiumClients = new Set(clients.filter((c) => c.is_premium).map((c) => c.id));
  const repName = new Map(refs.reps.map((r) => [r.id as number, r.display_name as string]));

  const keep = (d: { country_code: string; sales_rep_id: number | null; client_id: string }) =>
    (!filters.pays.length || filters.pays.includes(d.country_code)) &&
    (!filters.porteurs.length || (d.sales_rep_id !== null && filters.porteurs.includes(d.sales_rep_id))) &&
    (!filters.premium || premiumClients.has(d.client_id));

  return {
    supabase,
    profile,
    refs,
    filters,
    deals,
    tl,
    historyStart: historyStart ? historyStart.slice(0, 10) : null,
    // Journal illisible (clé de service absente et rôle sans accès) : les rapports historiques seraient faux.
    historyMissing: deals.length > 0 && tl.size === 0,
    clientById,
    repName,
    keep,
    keepState: (s: DealState) => keep(s),
    now: new Date().toISOString(),
    today: new Date().toISOString().slice(0, 10),
  };
}

export function quarterOptions(year = Number(currentQuarter().slice(0, 4))) {
  return [year - 1, year, year + 1].flatMap((y) => [1, 2, 3, 4].map((q) => ({ value: `${y}-T${q}`, label: `T${q} ${y}` })));
}

/** Définition des filtres en pastilles, communs aux rapports. */
export function commonFilters(refs: Awaited<ReturnType<typeof getReferences>>) {
  return [
    { name: "pays", label: "Pays", options: refs.countries.map((c) => ({ value: c.code as string, label: c.name as string })) },
    {
      name: "porteur",
      label: "Commercial",
      options: refs.reps.filter((r) => r.active !== false && !r.is_sdr).map((r) => ({ value: String(r.id), label: r.display_name as string })),
    },
    { name: "premium", label: "Premium", single: true, options: [{ value: "1", label: "★ Clients Premium" }] },
  ];
}

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const LONG = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
export const shortDate = (iso: string) => DAY.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
export const longDate = (iso: string) => LONG.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

/** Périodes proposées : chaque mois depuis le début de l'historique, puis les trimestres concernés. */
export function periods(historyStart: string, today: string) {
  const months: string[] = [];
  for (let m = `${historyStart.slice(0, 7)}-01`; m <= today; ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  }
  const quarters = [...new Set(months.map((m) => `${m.slice(0, 4)}-T${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`))];
  return [
    ...months.reverse().map((m) => ({ value: m.slice(0, 7), label: MONTH.format(new Date(`${m}T12:00:00Z`)), from: m, to: monthEnd(m) })),
    ...quarters.reverse().map((q) => ({ value: q, label: q.replace("-", " "), ...quarterRange(q) })),
  ];
}

