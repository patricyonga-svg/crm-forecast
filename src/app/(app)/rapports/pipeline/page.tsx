import Link from "next/link";
import { QuarterPicker } from "@/components/QuarterPicker";
import { CountryBadge, CoverageBar, Legend, NeededSwatch, Rate, Swatch } from "@/components/charts";
import { countryColor, coverage, formatM, groupByCountry, ratio, sumObjectives } from "@/lib/reports";
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
      forecastScale: Math.max(1, ...rows.flatMap((r) => [r.cov.forecast, r.cov.forecastNeeded])),
      pipeScale: Math.max(1, ...rows.flatMap((r) => [r.cov.pipe, r.cov.pipeNeeded])),
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
          { label: "Réalisé", swatch: <Swatch color="#2a78d6" /> },
          { label: "Forecast en cours / pipe", swatch: <Swatch color="#a9c4e6" /> },
          { label: "Minimum attendu", swatch: <NeededSwatch /> },
        ]}
      />

      {groups.map((g) => {
        const c = countryColor(g.code);
        return (
          <section key={g.code} className="card space-y-3 overflow-x-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CountryBadge code={g.code} color={c.strong} />
                {g.name}
              </h2>
              <p className="text-sm text-zinc-600">
                objectif {formatM(g.cov.objective)} · forecast {formatM(g.cov.forecast)} / {formatM(g.cov.forecastNeeded)} ·{" "}
                <Rate rate={ratio(g.cov.forecast, g.cov.forecastNeeded)} /> · pipe {formatM(g.cov.pipe)} / {formatM(g.cov.pipeNeeded)} ·{" "}
                <Rate rate={ratio(g.cov.pipe, g.cov.pipeNeeded)} />
              </p>
            </div>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="pb-1 text-left font-medium">Commercial</th>
                  <th className="pb-1 text-right font-medium">Objectif</th>
                  <th className="pb-1 pl-4 text-left font-medium">Forecast vs minimum</th>
                  <th className="pb-1 text-right font-medium" />
                  <th className="pb-1 text-right font-medium">M XOF</th>
                  <th className="pb-1 pl-4 text-left font-medium">Pipe vs minimum</th>
                  <th className="pb-1 text-right font-medium" />
                  <th className="pb-1 text-right font-medium">M XOF</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.key} className={r.noTarget ? "text-zinc-500" : ""}>
                    <td className="py-1.5 pr-2 font-semibold">{r.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.noTarget ? "—" : formatM(r.cov.objective)}</td>
                    <td className="w-1/5 py-1.5 pl-4">
                      <CoverageBar done={r.cov.done} value={r.cov.forecast} needed={r.cov.forecastNeeded} scale={g.forecastScale} strong={c.strong} light={c.light} />
                    </td>
                    <td className="py-1.5 pl-2 text-right">{r.noTarget ? "—" : <Rate rate={ratio(r.cov.forecast, r.cov.forecastNeeded)} />}</td>
                    <td className="whitespace-nowrap py-1.5 pl-2 text-right text-xs text-zinc-500 tabular-nums">
                      {formatM(r.cov.forecast).replace(" M", "")}/{formatM(r.cov.forecastNeeded).replace(" M", "")}
                    </td>
                    <td className="w-1/5 py-1.5 pl-4">
                      <CoverageBar value={r.cov.pipe} needed={r.cov.pipeNeeded} scale={g.pipeScale} strong={c.strong} light={c.light} />
                    </td>
                    <td className="py-1.5 pl-2 text-right">{r.noTarget ? "—" : <Rate rate={ratio(r.cov.pipe, r.cov.pipeNeeded)} />}</td>
                    <td className="whitespace-nowrap py-1.5 pl-2 text-right text-xs text-zinc-500 tabular-nums">
                      {formatM(r.cov.pipe).replace(" M", "")}/{formatM(r.cov.pipeNeeded).replace(" M", "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <p className="text-xs text-zinc-500">
        Forecast = réalisé + affaires au stade Forecast du trimestre · Pipe = toutes les affaires du trimestre (Opportunité, Forecast, Won Pending, Won) ·
        les affaires ouvertes datées du trimestre précédent sont comptées en retard · montants en millions de XOF.
      </p>
    </div>
  );
}
