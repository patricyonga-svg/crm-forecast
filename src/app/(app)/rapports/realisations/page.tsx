import Link from "next/link";
import { QuarterPicker } from "@/components/QuarterPicker";
import { CountryBadge, Legend, ProgressBar, Rate, Swatch } from "@/components/charts";
import { elapsed, formatM, groupByCountry, monthEnd, ratio, realised, sumObjectives } from "@/lib/reports";
import { loadQuarter, monthLabel, pickMonth } from "../data";

type Search = { trimestre?: string; mois?: string };

export default async function AchievementsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { refs, trimestre, from, to, months, deals, objectives } = await loadQuarter(params.trimestre);
  const month = pickMonth(months, params.mois);
  const mEnd = monthEnd(month);
  const mName = monthLabel(month);
  const monthElapsed = elapsed(month, mEnd);
  const quarterElapsed = elapsed(from, to);

  const groups = groupByCountry(refs.countries, refs.reps, deals, objectives).map((g) => {
    const rows = g.reps.map((r) => ({
      key: r.id ?? "none",
      name: r.name,
      noTarget: r.id === null,
      monthDone: realised(r.deals, month, mEnd),
      monthObjective: sumObjectives(r.objectives, [month]),
      done: realised(r.deals, from, to),
      objective: sumObjectives(r.objectives, months),
    }));
    const sum = (k: "monthDone" | "monthObjective" | "done" | "objective") => rows.reduce((s, r) => s + r[k], 0);
    return { ...g, rows, monthDone: sum("monthDone"), monthObjective: sum("monthObjective"), done: sum("done"), objective: sum("objective") };
  });
  const reps = groups.flatMap((g) => g.rows.filter((r) => !r.noTarget && (r.objective > 0 || r.monthDone > 0)));
  const billed = reps.filter((r) => r.monthDone > 0).length;
  const onTrack = reps.filter((r) => r.monthObjective > 0 && r.monthDone / r.monthObjective >= (monthElapsed || 1)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Réalisé par commercial vs objectifs mensuel et trimestriel</p>
          <h1 className="text-2xl font-extrabold">
            {billed} commerciaux sur {reps.length} ont facturé en {mName}, {onTrack} au niveau du prorata
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm">
            {months.map((m) => (
              <Link
                key={m}
                href={`?trimestre=${trimestre}&mois=${m}`}
                className={`px-3 py-2 capitalize ${m === month ? "bg-[#14213d] text-white" : "hover:bg-zinc-50"}`}
              >
                {monthLabel(m)}
              </Link>
            ))}
          </div>
          <QuarterPicker value={trimestre} />
        </div>
      </div>

      <Legend
        items={[
          { label: "Réalisé (Won Pending + Won)", swatch: <Swatch color="#14213d" /> },
          { label: "Objectif", swatch: <Swatch color="#e6e8ee" /> },
          { label: "Prorata à date", swatch: <Swatch dashed /> },
        ]}
      />

      <div className="grid gap-4">
        {groups.map((g) => {
          return (
            <section key={g.code} className="card space-y-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CountryBadge code={g.code} />
                  {g.name}
                </h2>
                <p className="text-sm text-zinc-600">
                  {mName} : {formatM(g.monthDone)} / {formatM(g.monthObjective)} XOF ·{" "}
                  <Rate rate={ratio(g.monthDone, g.monthObjective)} expected={monthElapsed || 1} /> — trimestre : {formatM(g.done)} / {formatM(g.objective)} XOF ·{" "}
                  <Rate rate={ratio(g.done, g.objective)} expected={quarterElapsed || 1} />
                </p>
              </div>
              {/* Grille fixe : mêmes largeurs de colonnes pour tous les pays. */}
              <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] table-fixed text-sm">
                <colgroup>
                  <col className="w-44" />
                  <col />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-36" />
                </colgroup>
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="pb-1 text-left font-medium">Commercial</th>
                    <th className="pb-1 text-left font-medium capitalize">{mName}</th>
                    <th className="pb-1 text-right font-medium">Mois</th>
                    <th className="pb-1 text-right font-medium">Trim.</th>
                    <th className="pb-1 text-right font-medium">Réalisé du mois</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.key} className={r.noTarget ? "text-zinc-500" : ""}>
                      <td className="truncate py-1.5 pr-2 font-semibold" title={r.name}>
                        {r.name}
                      </td>
                      <td className="py-1.5 pr-2">
                        <ProgressBar value={r.monthDone} target={r.monthObjective} marker={monthElapsed} />
                      </td>
                      <td className="py-1.5 pl-1 text-right">
                        {r.noTarget ? "—" : <Rate rate={ratio(r.monthDone, r.monthObjective)} expected={monthElapsed || 1} />}
                      </td>
                      <td className="py-1.5 pl-1 text-right text-zinc-600">{r.noTarget ? "—" : <Rate rate={ratio(r.done, r.objective)} expected={quarterElapsed || 1} />}</td>
                      <td className="whitespace-nowrap py-1.5 pl-2 text-right text-xs text-zinc-500 tabular-nums">
                        {formatM(r.monthDone)} sur {formatM(r.monthObjective)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">
        Réalisé = affaires Won Pending et Won dont la date de closing tombe dans la période · la dernière colonne compare le réalisé du mois à son objectif,
        en millions de XOF · pastille verte à partir du prorata de la période écoulée (trait orange), ambre à partir de la moitié du prorata, rouge en dessous.
      </p>
    </div>
  );
}
