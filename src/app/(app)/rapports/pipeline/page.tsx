import Link from "next/link";
import { QuarterPicker } from "@/components/QuarterPicker";
import { Avatar, CountryBadge, CoverageBar, Legend, NeededSwatch, StatusPill, Swatch } from "@/components/charts";
import { coverage, formatM, groupByCountry, ratio, sumObjectives } from "@/lib/reports";
import { loadQuarter } from "../data";

export default async function PipelineReportPage({ searchParams }: { searchParams: Promise<{ trimestre?: string }> }) {
  const params = await searchParams;
  const { refs, trimestre, months, deals, objectives, settings } = await loadQuarter(params.trimestre);

  const groups = groupByCountry(refs.countries, refs.reps, deals, objectives).map((g) => {
    const rows = g.reps.map((r) => ({ key: r.id ?? "none", name: r.name, noTarget: r.id === null, cov: coverage(r.deals, sumObjectives(r.objectives, months), trimestre, settings) }));
    const cov = coverage(
      g.reps.flatMap((r) => r.deals),
      sumObjectives(
        g.reps.flatMap((r) => r.objectives),
        months,
      ),
      trimestre,
      settings,
    );
    return {
      ...g,
      rows,
      cov,
      // Commerciaux avec objectif, du plus grand manque au plus petit ; les autres sont repliés en bas.
      targeted: rows
        .filter((r) => !r.noTarget && r.cov.objective > 0)
        .sort((a, b) => b.cov.forecastNeeded - b.cov.forecast - (a.cov.forecastNeeded - a.cov.forecast)),
      untargeted: rows.filter((r) => r.noTarget || r.cov.objective === 0),
      forecastScale: Math.max(1, ...rows.flatMap((r) => [r.cov.forecast, r.cov.forecastNeeded])),
    };
  });
  const reps = groups.flatMap((g) => g.rows.filter((r) => !r.noTarget && r.cov.objective > 0));
  const covered = reps.filter((r) => r.cov.forecast >= r.cov.forecastNeeded).length;
  const empty = reps.filter((r) => r.cov.forecast === 0).length;
  const fm = settings.forecast_multiple.toLocaleString("fr-FR");
  const pm = settings.pipe_multiple.toLocaleString("fr-FR");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Forecast et pipe par commercial vs minimum attendu · {trimestre.replace("-", " ")}</p>
          <h1 className="text-2xl font-extrabold">
            {covered} commerciaux sur {reps.length} couvrent leur forecast minimal, {empty} n&apos;ont aucun forecast
          </h1>
          <p className="text-sm text-zinc-600">
            Forecast minimal = objectif × {fm} · pipe minimal = forecast minimal × {pm} (
            <Link href="/parametres/pipeline" className="underline">
              modifier
            </Link>
            )
          </p>
        </div>
        <QuarterPicker value={trimestre} />
      </div>

      <Legend
        items={[
          { label: "Réalisé", swatch: <Swatch color="#14213d" /> },
          { label: "Forecast en cours", swatch: <Swatch color="#b7c3dc" /> },
          { label: "Minimum attendu", swatch: <NeededSwatch /> },
        ]}
      />

      {groups.map((g) => (
        <section key={g.code} className="card space-y-3 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CountryBadge code={g.code} />
              {g.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <span>
                forecast {formatM(g.cov.forecast)} sur {formatM(g.cov.forecastNeeded)}
              </span>
              <StatusPill rate={ratio(g.cov.forecast, g.cov.forecastNeeded)} kind="target" />
              <span className="ml-2">
                pipe {formatM(g.cov.pipe)} sur {formatM(g.cov.pipeNeeded)}
              </span>
              <StatusPill rate={ratio(g.cov.pipe, g.cov.pipeNeeded)} kind="cover" />
            </div>
          </div>
          {/* Grille fixe : mêmes largeurs de colonnes pour tous les pays. */}
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <colgroup>
              <col className="w-52" />
              <col />
              <col className="w-28" />
              <col className="w-56" />
            </colgroup>
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-100">
                <th className="pb-1.5 text-left font-medium">Commercial</th>
                <th className="pb-1.5 pl-4 text-left font-medium">Forecast sur minimum attendu</th>
                <th className="pb-1.5 pl-4 text-right font-medium">Manque</th>
                <th className="pb-1.5 pl-6 text-left font-medium">Pipe</th>
              </tr>
            </thead>
            <tbody>
              {g.targeted.map((r) => {
                const gap = r.cov.forecastNeeded - r.cov.forecast;
                return (
                  <tr key={r.key} className="border-b border-zinc-50 last:border-0">
                    <td className="py-2 pr-2">
                      <span className="flex min-w-0 items-center gap-2 font-semibold" title={r.name}>
                        <Avatar name={r.name} />
                        <span className="truncate">{r.name}</span>
                      </span>
                    </td>
                    <td className="py-2 pl-4">
                      <CoverageBar done={r.cov.done} value={r.cov.forecast} needed={r.cov.forecastNeeded} scale={Math.max(g.forecastScale, 1)} />
                      <div className="mt-1 text-xs text-zinc-500 tabular-nums">
                        {formatM(r.cov.forecast)} sur {formatM(r.cov.forecastNeeded)}
                        {r.cov.done > 0 && ` · dont ${formatM(r.cov.done)} réalisés`}
                      </div>
                    </td>
                    <td className="py-2 pl-4 text-right tabular-nums">
                      {gap > 0 ? <span className="font-bold text-red-700">{formatM(gap)}</span> : <StatusPill rate={1} kind="target" />}
                    </td>
                    <td className="py-2 pl-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill rate={ratio(r.cov.pipe, r.cov.pipeNeeded)} kind="cover" />
                        <span className="text-xs text-zinc-500 tabular-nums">
                          {formatM(r.cov.pipe)} sur {formatM(r.cov.pipeNeeded)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {g.targeted.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-zinc-500">
                    Aucun objectif saisi pour ce pays ce trimestre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {g.untargeted.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-600">
                {g.untargeted.length} {g.untargeted.length > 1 ? "commerciaux" : "commercial"} sans objectif ce trimestre (
                {formatM(g.untargeted.reduce((sum, r) => sum + r.cov.pipe, 0))} de pipe)
              </summary>
              <ul className="mt-2 grid gap-1 text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                {g.untargeted.map((r) => (
                  <li key={r.key} className="flex justify-between gap-3 rounded-md bg-zinc-50 px-3 py-1.5">
                    <span>{r.name}</span>
                    <span className="tabular-nums">
                      forecast {formatM(r.cov.forecast)} · pipe {formatM(r.cov.pipe)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}

      <p className="text-xs text-zinc-500">
        Forecast = réalisé + affaires au stade Forecast du trimestre · Pipe = toutes les affaires du trimestre sauf les perdues (Opportunité, À relancer, Forecast, Won Pending, Won) ·
        les affaires ouvertes datées du trimestre précédent sont comptées en retard · montants en millions de XOF.
      </p>
    </div>
  );
}
