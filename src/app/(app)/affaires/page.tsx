import Link from "next/link";
import { getReferences, getSession } from "@/lib/session";
import { STAGES, dealTitle, formatDate, formatMoney, isStage, quarterRange, type Deal } from "@/lib/domain";
import { PipelineBoard } from "@/components/PipelineBoard";
import { MultiSelect } from "@/components/MultiSelect";
import { StageBadge } from "@/components/StageBadge";

type Row = Deal & {
  clients: { name: string };
  business_lines: { name: string } | null;
  sales_reps: { display_name: string } | null;
};

type Param = string | string[] | undefined;
type Search = { q?: string; pays?: Param; etape?: Param; porteur?: Param; lob?: Param; trimestre?: Param; vue?: string; mode?: string };

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
    .select("*, clients!inner(name), business_lines(name), sales_reps(display_name)")
    .order("expected_close_date", { ascending: true, nullsFirst: false })
    .limit(2000);

  if (params.q) query = query.ilike("clients.name", `%${params.q}%`);
  const f = {
    pays: list(params.pays),
    etape: list(params.etape),
    lob: list(params.lob),
    porteur: list(params.porteur),
    trimestre: list(params.trimestre),
  };
  if (f.pays.length) query = query.in("country_code", f.pays);
  if (f.etape.length) query = query.in("stage", f.etape);
  if (f.lob.length) query = query.in("business_line_id", f.lob.map(Number));
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
      forecast: t.forecast + Number(d.forecast_amount),
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
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm font-semibold">
            <Link href={withMode("liste")} className={`px-3 py-2 ${pipe ? "hover:bg-zinc-50" : "bg-brand-navy text-white"}`}>
              Liste
            </Link>
            <Link href={withMode("pipe")} className={`border-l border-zinc-300 px-3 py-2 ${pipe ? "bg-brand-navy text-white" : "hover:bg-zinc-50"}`}>
              Pipe
            </Link>
          </div>
          <Link href={params.vue === "miennes" ? "/affaires" : "/affaires?vue=miennes"} className="btn-secondary">
            {params.vue === "miennes" ? "Toutes les affaires" : "Mes affaires"}
          </Link>
          <Link href="/affaires/nouvelle" className="btn">
            Nouvelle affaire
          </Link>
        </div>
      </div>

      <form className="card grid grid-cols-2 gap-2 md:grid-cols-7">
        {params.vue && <input type="hidden" name="vue" value={params.vue} />}
        {params.mode && <input type="hidden" name="mode" value={params.mode} />}
        <input name="q" defaultValue={params.q} placeholder="Client…" className="input col-span-2 md:col-span-1" />
        <MultiSelect
          key={`pays:${f.pays.join()}`}
          name="pays"
          allLabel="Tous les pays"
          defaultValue={f.pays}
          options={refs.countries.map((c) => ({ value: c.code, label: c.name }))}
        />
        <MultiSelect
          key={`etape:${f.etape.join()}`}
          name="etape"
          allLabel="Toutes les étapes"
          defaultValue={f.etape}
          options={STAGES.map((st) => ({ value: st.value, label: st.label }))}
        />
        <MultiSelect
          key={`lob:${f.lob.join()}`}
          name="lob"
          allLabel="Toutes les LoB"
          defaultValue={f.lob}
          options={refs.lines.map((l) => ({ value: String(l.id), label: l.name }))}
        />
        <MultiSelect
          key={`porteur:${f.porteur.join()}`}
          name="porteur"
          allLabel="Tous les porteurs"
          defaultValue={f.porteur}
          options={[{ value: "aucun", label: "Sans porteur" }, ...refs.reps.map((r) => ({ value: String(r.id), label: r.display_name }))]}
        />
        <MultiSelect
          key={`trimestre:${f.trimestre.join()}`}
          name="trimestre"
          allLabel="Toutes les dates"
          defaultValue={f.trimestre}
          options={[{ value: "sans-date", label: "Sans date de closing" }, ...quarters.map((q) => ({ value: q, label: q.replace("-", " ") }))]}
        />
        <div className="flex gap-2">
          <button className="btn flex-1">Filtrer</button>
          <Link href={`/affaires?${new URLSearchParams({ ...(params.vue ? { vue: params.vue } : {}), ...(params.mode ? { mode: params.mode } : {}) })}`} className="btn-secondary px-3" title="Effacer les filtres">
            ✕
          </Link>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["Pipe (devis)", totals.quote],
          ["Forecast", totals.forecast],
          ["Facturé", totals.invoiced],
          ["Encaissé", totals.collected],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatMoney(value as number)}</div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-700">Erreur de chargement : {error.message}</p>}

      {pipe ? (
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
            late: !!d.expected_close_date && d.expected_close_date < today && !["won", "won_pending", "perdu"].includes(d.stage),
          }))}
        />
      ) : (
      <div className="card overflow-x-auto p-0">
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
                <td colSpan={9} className="px-3 py-6 text-center text-zinc-500">
                  Aucune affaire ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-zinc-500">{deals.length} affaires</p>
    </div>
  );
}
