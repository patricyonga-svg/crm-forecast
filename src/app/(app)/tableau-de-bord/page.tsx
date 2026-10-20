import { getReferences, getSession } from "@/lib/session";
import { currentQuarter, formatMoney, percent, quarterRange } from "@/lib/domain";
import { saveObjective } from "./actions";

type DealRow = {
  country_code: string;
  business_line_id: number | null;
  expected_close_date: string | null;
  quote_amount: number;
  forecast_amount: number;
  invoiced_amount: number;
  collected_amount: number;
};

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long" });

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ trimestre?: string }> }) {
  const { trimestre = currentQuarter() } = await searchParams;
  const { supabase, profile } = await getSession();
  const refs = await getReferences(supabase);
  const { from, to, months } = quarterRange(trimestre);

  const [{ data: deals }, { data: objectives }] = await Promise.all([
    supabase
      .from("deal_amounts")
      .select("country_code, business_line_id, expected_close_date, quote_amount, forecast_amount, invoiced_amount, collected_amount")
      .gte("expected_close_date", from)
      .lte("expected_close_date", to)
      .returns<DealRow[]>(),
    supabase.from("objectives").select("*").gte("month", from).lte("month", to),
  ]);

  const canEditObjectives = profile?.role === "admin" || profile?.role === "manager";
  const lineName = new Map(refs.lines.map((l) => [l.id, l.name]));
  const year = Number(trimestre.slice(0, 4));
  const quarterOptions = [year - 1, year, year + 1].flatMap((y) => [1, 2, 3, 4].map((q) => `${y}-T${q}`));

  // Réalisé = montant facturé (Won Pending + Won), rattaché au mois de closing.
  const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

  const sections = refs.countries
    .map((country) => {
      const countryDeals = (deals ?? []).filter((d) => d.country_code === country.code);
      const countryObjectives = (objectives ?? []).filter((o) => o.country_code === country.code);
      const lineIds = [...new Set([...countryDeals.map((d) => d.business_line_id), ...countryObjectives.map((o) => o.business_line_id)])];
      const rows = lineIds.map((lineId) => {
        const ds = countryDeals.filter((d) => d.business_line_id === lineId);
        const objByMonth = months.map((m) =>
          countryObjectives.filter((o) => o.business_line_id === lineId && o.month === m).reduce((s, o) => s + Number(o.amount), 0),
        );
        const doneByMonth = months.map((m) => ds.filter((d) => monthOf(d.expected_close_date!) === m).reduce((s, d) => s + Number(d.invoiced_amount), 0));
        return {
          lineId,
          name: lineId ? lineName.get(lineId) ?? "?" : "Sans LoB",
          objByMonth,
          doneByMonth,
          objective: objByMonth.reduce((a, b) => a + b, 0),
          done: doneByMonth.reduce((a, b) => a + b, 0),
          forecast: ds.reduce((s, d) => s + Number(d.forecast_amount), 0),
          pipe: ds.reduce((s, d) => s + Number(d.quote_amount), 0),
          collected: ds.reduce((s, d) => s + Number(d.collected_amount), 0),
        };
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return { country, rows };
    })
    .filter((s) => s.rows.length > 0);

  const all = sections.flatMap((s) => s.rows);
  const sum = (k: "objective" | "done" | "forecast" | "pipe" | "collected") => all.reduce((s, r) => s + r[k], 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Tableau de bord · {trimestre.replace("-", " ")}</h1>
        <form className="flex gap-2">
          <select name="trimestre" defaultValue={trimestre} className="input">
            {quarterOptions.map((q) => (
              <option key={q} value={q}>
                {q.replace("-", " ")}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Afficher</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ["Objectif", formatMoney(sum("objective"))],
          ["Réalisé (facturé)", formatMoney(sum("done"))],
          ["Taux de réalisation", percent(sum("done"), sum("objective"))],
          ["Forecast", formatMoney(sum("forecast"))],
          ["Pipe", formatMoney(sum("pipe"))],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {sections.map(({ country, rows }) => (
        <section key={country.code} className="card space-y-2 overflow-x-auto">
          <h2 className="font-medium">{country.name}</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-1 pr-3">LoB</th>
                {months.map((m) => (
                  <th key={m} className="py-1 pr-3 text-right capitalize">
                    {MONTH.format(new Date(`${m}T00:00:00`))}
                  </th>
                ))}
                <th className="py-1 pr-3 text-right">Réalisé</th>
                <th className="py-1 pr-3 text-right">Objectif</th>
                <th className="py-1 pr-3 text-right">Taux</th>
                <th className="py-1 pr-3 text-right">Reste à faire</th>
                <th className="py-1 pr-3 text-right">Forecast</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.lineId ?? "none"} className="border-t border-zinc-100">
                  <td className="py-1 pr-3">{r.name}</td>
                  {r.doneByMonth.map((v, i) => (
                    <td key={i} className="py-1 pr-3 text-right">
                      {formatMoney(v, country.currency)}
                      <div className="text-xs text-zinc-500">{percent(v, r.objByMonth[i])}</div>
                    </td>
                  ))}
                  <td className="py-1 pr-3 text-right font-medium">{formatMoney(r.done, country.currency)}</td>
                  <td className="py-1 pr-3 text-right">{formatMoney(r.objective, country.currency)}</td>
                  <td className="py-1 pr-3 text-right">{percent(r.done, r.objective)}</td>
                  <td className="py-1 pr-3 text-right">{formatMoney(Math.max(r.objective - r.done, 0), country.currency)}</td>
                  <td className="py-1 pr-3 text-right">{formatMoney(r.forecast, country.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {sections.length === 0 && <p className="text-sm text-zinc-500">Aucune affaire ni objectif sur ce trimestre.</p>}

      {canEditObjectives && (
        <details className="card">
          <summary className="cursor-pointer font-medium">Saisir un objectif mensuel</summary>
          <form action={saveObjective} className="mt-3 grid gap-2 md:grid-cols-5">
            <select name="country_code" defaultValue={profile?.country_code ?? ""} className="input" required>
              {refs.countries
                .filter((c) => profile?.role === "admin" || c.code === profile?.country_code)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
            </select>
            <select name="business_line_id" className="input" required>
              {refs.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select name="month" className="input" required>
              {months.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {MONTH.format(new Date(`${m}T00:00:00`))} {m.slice(0, 4)}
                </option>
              ))}
            </select>
            <input name="amount" type="number" min={0} placeholder="Montant" className="input" required />
            <button className="btn">Enregistrer</button>
          </form>
        </details>
      )}
    </div>
  );
}
