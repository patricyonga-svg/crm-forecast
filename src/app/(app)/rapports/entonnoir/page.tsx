import { currentQuarter, quarterRange } from "@/lib/domain";
import { formatM, funnel } from "@/lib/reports";
import { loadPeriod } from "../data";

type Search = { du?: string; au?: string; pays?: string; porteur?: string; trimestre?: string };

const LEVEL_COLORS = ["#14213d", "#2a78d6", "#eb6834", "#1baf7a"];
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function FunnelPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const quarter = quarterRange(params.trimestre ?? currentQuarter());
  const from = isDate(params.du) ? params.du! : quarter.from;
  const to = isDate(params.au) ? params.au! : quarter.to;
  const { refs, deals, undated } = await loadPeriod(from, to);

  const scoped = deals.filter(
    (d) => (!params.pays || d.country_code === params.pays) && (!params.porteur || String(d.sales_rep_id ?? "aucun") === params.porteur),
  );
  const levels = funnel(scoped);
  const top = levels[0].amount || 1;
  const byCountry = refs.countries
    .filter((c) => !params.pays || c.code === params.pays)
    .map((c) => ({ ...c, levels: funnel(scoped.filter((d) => d.country_code === c.code)) }))
    .filter((c) => c.levels[0].count > 0);
  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Structure du pipe</p>
        <h1 className="text-2xl font-extrabold">
          Du {fmtDate(from)} au {fmtDate(to)} : {levels[0].count} affaires, {formatM(levels[0].amount)} XOF
        </h1>
      </div>

      <form className="card grid gap-2 md:grid-cols-5">
        <label className="text-xs text-zinc-500">
          Closing du
          <input type="date" name="du" defaultValue={from} className="input mt-1" />
        </label>
        <label className="text-xs text-zinc-500">
          au
          <input type="date" name="au" defaultValue={to} className="input mt-1" />
        </label>
        <label className="text-xs text-zinc-500">
          Pays
          <select name="pays" defaultValue={params.pays ?? ""} className="input mt-1">
            <option value="">Tous</option>
            {refs.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Commercial
          <select name="porteur" defaultValue={params.porteur ?? ""} className="input mt-1">
            <option value="">Tous</option>
            <option value="aucun">Sans commercial</option>
            {refs.reps
              .filter((r) => !params.pays || r.country_code === params.pays)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn w-full">Afficher</button>
        </div>
      </form>

      <section className="card space-y-2 py-6">
        {levels.map((l, i) => {
          const width = Math.max((l.amount / top) * 100, 6);
          const conversion = i > 0 && levels[i - 1].amount > 0 ? Math.round((l.amount / levels[i - 1].amount) * 100) : null;
          return (
            <div key={l.label} className="grid items-center gap-3 md:grid-cols-[1fr_200px]">
              <div className="flex justify-center">
                <div
                  className="flex h-14 items-center justify-center rounded-md px-3 text-sm font-semibold text-white"
                  style={{ width: `${width}%`, background: LEVEL_COLORS[i] }}
                >
                  {width >= 15 && <span className="truncate">{formatM(l.amount)} XOF</span>}
                </div>
              </div>
              <div className="text-sm">
                <div className="font-bold">
                  {l.label} · {formatM(l.amount)} XOF
                </div>
                <div className="text-zinc-500">
                  {l.count} affaire{l.count > 1 ? "s" : ""}
                  {conversion !== null && ` · ${conversion} % du niveau précédent`}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {byCountry.length > 1 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-bold">Par pays</h2>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 text-left font-medium">Pays</th>
                {levels.map((l) => (
                  <th key={l.label} className="py-1 text-right font-medium">
                    {l.label}
                  </th>
                ))}
                <th className="py-1 text-right font-medium">Opportunité → Won</th>
              </tr>
            </thead>
            <tbody>
              {byCountry.map((c) => (
                <tr key={c.code} className="border-t border-zinc-100">
                  <td className="py-1.5 font-semibold">{c.name}</td>
                  {c.levels.map((l) => (
                    <td key={l.label} className="py-1.5 text-right">
                      {formatM(l.amount)} <span className="text-xs text-zinc-500">({l.count})</span>
                    </td>
                  ))}
                  <td className="py-1.5 text-right">{c.levels[0].amount ? `${Math.round((c.levels[3].amount / c.levels[0].amount) * 100)} %` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Entonnoir cumulé sur les affaires dont la date de closing tombe dans la période : chaque niveau compte les affaires arrivées au moins à cette
        étape (le niveau Opportunité contient donc tout le pipe). Montants des devis en millions de XOF.
        {undated > 0 && ` ${undated} affaires sans date de closing ne sont pas comptées.`}
      </p>
    </div>
  );
}
