import Link from "next/link";
import { QuarterPicker } from "@/components/QuarterPicker";
import { CoverageBar, Kpi, Legend, NeededSwatch, ProgressBar, Rate, Swatch } from "@/components/charts";
import { countryColor, coverage, elapsed, formatM, groupByCountry, monthEnd, ratio, realised, sumObjectives } from "@/lib/reports";
import { loadQuarter, monthLabel, pickMonth } from "./data";

type Search = { trimestre?: string; mois?: string };

export default async function SummaryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { refs, trimestre, from, to, months, deals, objectives, settings } = await loadQuarter(params.trimestre);
  const month = pickMonth(months, params.mois);
  const mEnd = monthEnd(month);
  const monthElapsed = elapsed(month, mEnd);
  const quarterElapsed = elapsed(from, to);

  const groups = groupByCountry(refs.countries, refs.reps, deals, objectives).map((g) => {
    const ds = g.reps.flatMap((r) => r.deals);
    const os = g.reps.flatMap((r) => r.objectives);
    return {
      ...g,
      monthDone: realised(ds, month, mEnd),
      monthObjective: sumObjectives(os, [month]),
      cov: coverage(ds, sumObjectives(os, months), trimestre, settings),
    };
  });
  const total = (pick: (g: (typeof groups)[number]) => number) => groups.reduce((s, g) => s + pick(g), 0);
  const t = {
    monthDone: total((g) => g.monthDone),
    monthObjective: total((g) => g.monthObjective),
    objective: total((g) => g.cov.objective),
    done: total((g) => g.cov.done),
    forecast: total((g) => g.cov.forecast),
    forecastNeeded: total((g) => g.cov.forecastNeeded),
    pipe: total((g) => g.cov.pipe),
    pipeNeeded: total((g) => g.cov.pipeNeeded),
  };
  const mName = monthLabel(month);
  const forecastGap = Math.max(t.forecastNeeded - t.forecast, 0);
  const scale = Math.max(1, ...groups.flatMap((g) => [g.cov.pipe, g.cov.pipeNeeded, g.cov.forecast, g.cov.forecastNeeded]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Synthèse · {trimestre.replace("-", " ")}</p>
          <h1 className="text-2xl font-extrabold">
            {mName[0].toUpperCase() + mName.slice(1)} : {formatM(t.monthDone)} XOF réalisés
            {t.monthObjective > 0 && `, ${Math.round((t.monthDone / t.monthObjective) * 100)} % de l'objectif du mois`}
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

      {t.objective === 0 && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Aucun objectif n&apos;est saisi pour ce trimestre : les taux d&apos;atteinte et de couverture restent vides. Renseignez-les dans{" "}
          <Link href={`/parametres/objectifs?trimestre=${trimestre}`} className="underline">
            Paramètres › Objectifs
          </Link>
          .
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label={`Réalisé ${mName}`} value={`${formatM(t.monthDone)} XOF`} sub="Won Pending + Won du mois" />
        <Kpi label={`Objectif ${mName}`} value={`${formatM(t.monthObjective)} XOF`} sub={`${formatM(t.objective)} XOF sur le trimestre`} />
        <Kpi
          label={`Atteinte ${mName}`}
          value={<Rate rate={ratio(t.monthDone, t.monthObjective)} expected={monthElapsed || 1} />}
          sub={monthElapsed > 0 && monthElapsed < 1 ? `${Math.round(monthElapsed * 100)} % du mois écoulé` : undefined}
        />
        <Kpi
          label="Atteinte trimestre"
          value={<Rate rate={ratio(t.done, t.objective)} expected={quarterElapsed || 1} />}
          sub={`reste ${formatM(Math.max(t.objective - t.done, 0))} XOF à réaliser`}
        />
        <Kpi label="Forecast trimestre" value={`${formatM(t.forecast)} XOF`} sub={`minimum attendu ${formatM(t.forecastNeeded)} XOF`} />
        <Kpi
          label="Forecast manquant"
          value={`${formatM(forecastGap)} XOF`}
          valueClass={forecastGap > 0 ? "text-red-700" : "text-emerald-700"}
          sub={`objectif × ${settings.forecast_multiple.toLocaleString("fr-FR")}`}
        />
        <Kpi label="Pipe trimestre" value={`${formatM(t.pipe)} XOF`} sub={`minimum attendu ${formatM(t.pipeNeeded)} XOF`} />
        <Kpi
          label="Couverture du pipe"
          value={<Rate rate={ratio(t.pipe, t.pipeNeeded)} />}
          sub={`forecast minimal × ${settings.pipe_multiple.toLocaleString("fr-FR")}`}
        />
      </div>

      <section className="space-y-4">
        <div>
          <p className="eyebrow">Résultat de {mName} par pays</p>
          <Legend
            items={[
              { label: `Objectif ${mName}`, swatch: <Swatch color="#e4e7ee" /> },
              { label: "Réalisé", swatch: <Swatch color="#2a78d6" /> },
              ...(monthElapsed > 0 && monthElapsed < 1 ? [{ label: "Prorata à date", swatch: <Swatch dashed /> }] : []),
            ]}
          />
        </div>
        <div className="card divide-y divide-zinc-100">
          {groups.map((g) => (
            <div key={g.code} className="grid items-center gap-3 py-3 md:grid-cols-[180px_1fr_70px_220px]">
              <div>
                <div className="font-bold">{g.name}</div>
                <div className="text-xs text-zinc-500">objectif trimestre {formatM(g.cov.objective)} XOF</div>
              </div>
              <ProgressBar value={g.monthDone} target={g.monthObjective} marker={monthElapsed} color={countryColor(g.code).strong} />
              <Rate rate={ratio(g.monthDone, g.monthObjective)} expected={monthElapsed || 1} className="text-xl" />
              <div className="text-sm md:text-right">
                <div className="font-semibold">{formatM(g.monthDone)} XOF réalisés</div>
                <div className="text-zinc-500">
                  sur {formatM(g.monthObjective)} XOF en {mName}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="eyebrow">Couverture de l&apos;objectif du trimestre par pays</p>
          <Legend
            items={[
              { label: "Réalisé", swatch: <Swatch color="#2a78d6" /> },
              { label: "Forecast / pipe", swatch: <Swatch color="#a9c4e6" /> },
              { label: "Minimum attendu", swatch: <NeededSwatch /> },
            ]}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {groups.map((g) => {
            const c = countryColor(g.code);
            const fGap = g.cov.forecast - g.cov.forecastNeeded;
            const pGap = g.cov.pipe - g.cov.pipeNeeded;
            return (
              <div key={g.code} className="card space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold">{g.name}</h3>
                  <span className="text-xs text-zinc-500">objectif {formatM(g.cov.objective)} XOF</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Forecast {formatM(g.cov.forecast)}</span>
                    <span className="text-zinc-500">min. {formatM(g.cov.forecastNeeded)}</span>
                  </div>
                  <CoverageBar done={g.cov.done} value={g.cov.forecast} needed={g.cov.forecastNeeded} scale={scale} strong={c.strong} light={c.light} />
                  <Gap value={fGap} hasTarget={g.cov.objective > 0} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Pipe {formatM(g.cov.pipe)}</span>
                    <span className="text-zinc-500">min. {formatM(g.cov.pipeNeeded)}</span>
                  </div>
                  <CoverageBar value={g.cov.pipe} needed={g.cov.pipeNeeded} scale={scale} strong={c.strong} light={c.light} />
                  <Gap value={pGap} hasTarget={g.cov.objective > 0} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        Montants en millions de XOF. Réalisé = Won Pending + Won datés de la période · Forecast = réalisé + affaires au stade Forecast · Pipe = toutes
        les affaires du trimestre · les affaires ouvertes du trimestre précédent comptent comme en retard.
      </p>
    </div>
  );
}

function Gap({ value, hasTarget }: { value: number; hasTarget: boolean }) {
  if (!hasTarget) return <div className="text-xs text-zinc-400">pas d&apos;objectif</div>;
  return value >= 0 ? (
    <div className="text-xs font-semibold text-emerald-700">couvert, marge {formatM(value)} XOF</div>
  ) : (
    <div className="text-xs font-semibold text-red-700">manque {formatM(-value)} XOF</div>
  );
}
