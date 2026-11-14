import Link from "next/link";
import { getReferences, getSession } from "@/lib/session";
import { SALE_CHANNELS, STAGES, dealTitle, lateCollection, formatDate, formatMoney, isStage, quarterRange, type Deal } from "@/lib/domain";
import { formatM } from "@/lib/reports";
import { PipelineBoard } from "@/components/PipelineBoard";
import { FilterBar } from "@/components/FilterBar";
import { StageBadge } from "@/components/StageBadge";
import { LateCollectionPill } from "@/components/charts";

type Row = Deal & {
  clients: { name: string };
  business_lines: { name: string } | null;
  sales_reps: { display_name: string } | null;
};

type Param = string | string[] | undefined;
type Search = { q?: string; pays?: Param; etape?: Param; porteur?: Param; lob?: Param; trimestre?: Param; vente?: Param; vue?: string; mode?: string };

/** Valeurs d'un filtre à choix multiple (?pays=SN&pays=CI), sans doublon ni valeur vide. */
function list(p: Param): string[] {
  return [...new Set((Array.isArray(p) ? p : p ? [p] : []).filter(Boolean))];
}

export default async function DealsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, user } = await getSession();
  const refs = await getReferences(supabase);
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("deal_amounts")
    .select("*, clients!inner(name), business_lines(name), sales_reps!sales_rep_id(display_name)")
    .order("expected_close_date", { ascending: true, nullsFirst: false })
    .limit(2000);

  if (params.q) query = query.ilike("clients.name", `%${params.q}%`);
  const f = {
    pays: list(params.pays),
    etape: list(params.etape),
    lob: list(params.lob),
    porteur: list(params.porteur),
    trimestre: list(params.trimestre),
    vente: list(params.vente),
  };
  if (f.pays.length) query = query.in("country_code", f.pays);
  if (f.etape.length) query = query.in("stage", f.etape);
  if (f.lob.length) query = query.in("business_line_id", f.lob.map(Number));
  if (f.vente.length) query = query.in("sale_channel", f.vente);
  if (f.porteur.length) {
    const ids = f.porteur.filter((p) => p !== "aucun").map(Number).filter(Number.isFinite);
    const parts = [...(ids.length ? [`sales_rep_id.in.(${ids.join(",")})`] : []), ...(f.porteur.includes("aucun") ? ["sales_rep_id.is.null"] : [])];
    query = query.or(parts.length ? parts.join(",") : "sales_rep_id.eq.-1");
  }
  if (f.trimestre.length) {
    const parts = f.trimestre.flatMap((t) => {
      if (t === "sans-date") return ["expected_close_date.is.null"];
      if (!/^\d{4}-T[1-4]$/.test(t)) return [];
      const { from, to } = quarterRange(t);
      return [`and(expected_close_date.gte.${from},expected_close_date.lte.${to})`];
    });
    if (parts.length) query = query.or(parts.join(","));
  }
  if (params.vue === "relances") query = query.lte("next_action_date", today).not("stage", "in", "(won,perdu)");
  if (params.vue === "miennes") {
    const mine = refs.reps.filter((r) => r.profile_id === user.id).map((r) => r.id);
    query = query.in("sales_rep_id", mine.length ? mine : [-1]);
  }

  const { data, error } = await query.returns<Row[]>();
  const deals = data ?? [];
  const totals = deals.reduce(
    (t, d) => ({
      quote: t.quote + Number(d.quote_amount),
      // Sur cet écran, « Forecast » = affaires à l'étape Forecast uniquement, comme la colonne du pipe
      // (Won Pending et Won sont comptés dans « Facturé »).
      forecast: t.forecast + (d.stage === "forecast" ? Number(d.quote_amount) : 0),
      invoiced: t.invoiced + Number(d.invoiced_amount),
      collected: t.collected + Number(d.collected_amount),
    }),
    { quote: 0, forecast: 0, invoiced: 0, collected: 0 },
  );

  // Le pipe est l'affichage par défaut ; la liste reste celle des « Actions à faire ».
  const pipe = params.mode ? params.mode === "pipe" : params.vue !== "relances";
  // Lien vers la même liste en conservant les filtres, en changeant seulement le mode d'affichage.
  const withMode = (mode: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "mode" || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) q.append(k, one);
    }
    if (mode) q.set("mode", mode);
    const str = q.toString();
    return `/affaires${str ? `?${str}` : ""}`;
  };

  const year = new Date().getFullYear();
  const quarters = [year, year + 1].flatMap((y) => [1, 2, 3, 4].map((q) => `${y}-T${q}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{params.vue === "relances" ? "Actions à faire" : "Affaires"}</h1>
        <div className="flex flex-wrap gap-2">
          <div className="hidden overflow-hidden rounded-md border border-zinc-300 bg-white text-sm font-semibold md:inline-flex">
            <Link href={withMode("liste")} className={`px-3 py-2 ${pipe ? "hover:bg-zinc-50" : "bg-brand-navy text-white"}`}>
              Liste
            </Link>
            <Link href={withMode("pipe")} className={`border-l border-zinc-300 px-3 py-2 ${pipe ? "bg-brand-navy text-white" : "hover:bg-zinc-50"}`}>
              Pipe
            </Link>
          </div>
        </div>
      </div>

      <FilterBar
        filters={[
          { name: "pays", label: "Pays", options: refs.countries.map((c) => ({ value: c.code, label: c.name })) },
          { name: "etape", label: "Étape", options: STAGES.map((st) => ({ value: st.value, label: st.label })) },
          { name: "lob", label: "LoB", options: refs.lines.map((l) => ({ value: String(l.id), label: l.name })) },
          { name: "vente", label: "Type de vente", options: SALE_CHANNELS.map((c) => ({ value: c.value, label: c.label })) },
          {
            name: "porteur",
            label: "Porteur",
            options: [{ value: "aucun", label: "Sans porteur" }, ...refs.reps.map((r) => ({ value: String(r.id), label: r.display_name }))],
          },
          {
            name: "trimestre",
            label: "Date de closing",
            options: [{ value: "sans-date", label: "Sans date de closing" }, ...quarters.map((q) => ({ value: q, label: q.replace("-", " ") }))],
          },
        ]}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-500 tabular-nums">
        <span>
          <strong className="text-zinc-900">{deals.length}</strong> affaires
        </span>
        {[
          ["Pipe (devis)", totals.quote],
          ["Forecast", totals.forecast],
          ["Facturé", totals.invoiced],
          ["Encaissé", totals.collected],
        ].map(([label, value]) => (
          <span key={label as string}>
            {label} <strong className="text-zinc-900">{formatM(value as number)}</strong>
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-red-700">Erreur de chargement : {error.message}</p>}

      {/* Sur téléphone, les affaires s'affichent en fiches empilées (le pipe en colonnes reste pour l'ordinateur). */}
      {params.mode !== "pipe" && (
        <ul className="space-y-2 md:hidden">
          {deals.map((d) => {
            const late = !!d.next_action_date && d.next_action_date <= today;
            return (
              <li key={d.id}>
                <Link href={`/affaires/${d.id}`} className="card block space-y-1.5 p-3 active:bg-zinc-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{dealTitle(d, d.clients.name)}</div>
                      <div className="truncate text-xs text-zinc-500">
                        {d.name && d.name !== d.clients.name ? `${d.clients.name} · ` : ""}
                        {d.country_code} · {d.sales_reps?.display_name ?? "sans porteur"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-semibold tabular-nums">{formatM(Number(d.quote_amount))}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StageBadge stage={d.stage} />
                    {lateCollection(d, today) && <LateCollectionPill />}
                    {d.expected_close_date && <span className="text-xs text-zinc-500">closing {formatDate(d.expected_close_date)}</span>}
                  </div>
                  {d.next_action && (
                    <p className={`text-sm ${late ? "text-red-700" : "text-zinc-600"}`}>
                      <span className="font-medium">{d.next_action_date ? formatDate(d.next_action_date) : "À faire"} :</span> {d.next_action}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
          {deals.length === 0 && (
            <li className="card py-8 text-center text-sm text-zinc-500">
              <p>Aucune affaire ne correspond à ces filtres.</p>
              <Link href={params.vue ? `/affaires?vue=${params.vue}` : "/affaires"} className="btn-secondary mt-3">
                Effacer les filtres
              </Link>
            </li>
          )}
        </ul>
      )}

      {pipe ? (
        <div className={params.mode === "pipe" ? "" : "hidden md:block"}>
        <PipelineBoard
          key={JSON.stringify(params)}
          stages={f.etape.filter(isStage)}
          cards={deals.map((d) => ({
            id: d.id,
            title: dealTitle(d, d.clients.name),
            client: d.clients.name,
            amount: Number(d.quote_amount),
            stage: d.stage,
            rep: d.sales_reps?.display_name ?? null,
            close: d.expected_close_date,
            country: d.country_code,
            cards: d.cards_status,
            hasQuote: !!d.quote_file_path,
            hasInvoice: !!d.invoice_file_path,
            created: d.created_at.slice(0, 10),
            paymentDate: d.expected_payment_date,
            lateCollection: lateCollection(d, today),
            late: !!d.expected_close_date && d.expected_close_date < today && !["won", "won_pending", "perdu"].includes(d.stage),
          }))}
        />
        </div>
      ) : (
      <div className="card hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Affaire</th>
              <th className="px-3 py-2">Pays</th>
              <th className="px-3 py-2">LoB</th>
              <th className="px-3 py-2">Porteur</th>
              <th className="px-3 py-2">Étape</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2 text-right">Encaissé</th>
              <th className="px-3 py-2">Closing</th>
              <th className="px-3 py-2">Prochaine action</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2">
                  <Link href={`/affaires/${d.id}`} className="font-medium hover:underline">
                    {dealTitle(d, d.clients.name)}
                  </Link>
                  {d.name && d.name !== d.clients.name && <div className="text-xs text-zinc-500">{d.clients.name}</div>}
                </td>
                <td className="px-3 py-2">{d.country_code}</td>
                <td className="px-3 py-2">{d.business_lines?.name ?? <span className="text-red-600">—</span>}</td>
                <td className="px-3 py-2">{d.sales_reps?.display_name ?? <span className="text-red-600">—</span>}</td>
                <td className="px-3 py-2">
                  <StageBadge stage={d.stage} />
                  {lateCollection(d, today) && (
                    <div className="mt-1">
                      <LateCollectionPill />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(d.quote_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(d.collected_amount)}</td>
                <td className="px-3 py-2">
                  {d.expected_close_date ? formatDate(d.expected_close_date) : <span className="text-red-600">{d.closing_raw ?? "—"}</span>}
                </td>
                <td className={`px-3 py-2 ${d.next_action_date && d.next_action_date <= today ? "text-red-700" : ""}`}>
                  {d.next_action ? `${d.next_action} (${formatDate(d.next_action_date)})` : "—"}
                </td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-zinc-500">
                  <p>Aucune affaire ne correspond à ces filtres.</p>
                  <Link href={params.vue ? `/affaires?vue=${params.vue}` : "/affaires"} className="btn-secondary mt-3">
                    Effacer les filtres
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
