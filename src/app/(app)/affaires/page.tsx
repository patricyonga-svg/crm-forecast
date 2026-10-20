import Link from "next/link";
import { getReferences, getSession } from "@/lib/session";
import { STAGES, formatDate, formatMoney, quarterRange, type Deal } from "@/lib/domain";
import { StageBadge } from "@/components/StageBadge";

type Row = Deal & {
  clients: { name: string };
  business_lines: { name: string } | null;
  sales_reps: { display_name: string } | null;
};

type Search = { q?: string; pays?: string; etape?: string; porteur?: string; lob?: string; trimestre?: string; vue?: string };

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
  if (params.pays) query = query.eq("country_code", params.pays);
  if (params.etape) query = query.eq("stage", params.etape);
  if (params.lob) query = query.eq("business_line_id", Number(params.lob));
  if (params.porteur === "aucun") query = query.is("sales_rep_id", null);
  else if (params.porteur) query = query.eq("sales_rep_id", Number(params.porteur));
  if (params.trimestre === "sans-date") query = query.is("expected_close_date", null);
  else if (params.trimestre) {
    const { from, to } = quarterRange(params.trimestre);
    query = query.gte("expected_close_date", from).lte("expected_close_date", to);
  }
  if (params.vue === "relances") query = query.lte("next_action_date", today).neq("stage", "won");
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

  const year = new Date().getFullYear();
  const quarters = [year, year + 1].flatMap((y) => [1, 2, 3, 4].map((q) => `${y}-T${q}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{params.vue === "relances" ? "Affaires à relancer" : "Affaires"}</h1>
        <div className="flex gap-2">
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
        <input name="q" defaultValue={params.q} placeholder="Client…" className="input col-span-2 md:col-span-1" />
        <select name="pays" defaultValue={params.pays ?? ""} className="input">
          <option value="">Tous les pays</option>
          {refs.countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="etape" defaultValue={params.etape ?? ""} className="input">
          <option value="">Toutes les étapes</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="lob" defaultValue={params.lob ?? ""} className="input">
          <option value="">Toutes les LoB</option>
          {refs.lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="porteur" defaultValue={params.porteur ?? ""} className="input">
          <option value="">Tous les porteurs</option>
          <option value="aucun">Sans porteur</option>
          {refs.reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name}
            </option>
          ))}
        </select>
        <select name="trimestre" defaultValue={params.trimestre ?? ""} className="input">
          <option value="">Toutes les dates</option>
          <option value="sans-date">Sans date de closing</option>
          {quarters.map((q) => (
            <option key={q} value={q}>
              {q.replace("-", " ")}
            </option>
          ))}
        </select>
        <button className="btn">Filtrer</button>
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

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Pays</th>
              <th className="px-3 py-2">LoB</th>
              <th className="px-3 py-2">Porteur</th>
              <th className="px-3 py-2">Étape</th>
              <th className="px-3 py-2 text-right">Devis</th>
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
                    {d.clients.name}
                  </Link>
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
      <p className="text-xs text-zinc-500">{deals.length} affaires</p>
    </div>
  );
}
