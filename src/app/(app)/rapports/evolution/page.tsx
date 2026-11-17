import { FilterBar } from "@/components/FilterBar";
import { HistoryNotice } from "@/components/history-charts";
import { Kpi, Legend, StatusPill } from "@/components/charts";
import { LineChart, SeriesSwatch } from "@/components/history-charts";
import { currentQuarter, quarterRange } from "@/lib/domain";
import { backfillFromClosing, earliestDay, stateAt, toReportDeal, weeklyPoints } from "@/lib/history";
import { coverage, formatM, ratio, sumObjectives, type RepObjective, type Settings } from "@/lib/reports";
import { commonFilters, list, loadHistory, longDate, quarterOptions, shortDate, type Param } from "../history-data";

type Search = { trimestre?: Param; pays?: Param; porteur?: Param; premium?: Param };

const COLORS = { pipe: "#9aa3b5", forecast: "#14213d", done: "#1baf7a", needed: "#eb6834" };

export default async function EvolutionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const trimestre = list(params.trimestre).find((t) => /^\d{4}-T[1-4]$/.test(t)) ?? currentQuarter();
  const { from, to, months } = quarterRange(trimestre);
  const { supabase, refs, filters, tl, historyStart, keepState, now, historyMissing } = await loadHistory(params);

  const [{ data: objectives }, { data: settingsRow }] = await Promise.all([
    supabase.from("rep_objectives").select("sales_rep_id, month, amount").gte("month", from).lte("month", to).returns<RepObjective[]>(),
    supabase.from("pipeline_settings").select("forecast_multiple, pipe_multiple").single<Settings>(),
  ]);
  const settings = { forecast_multiple: Number(settingsRow?.forecast_multiple ?? 1), pipe_multiple: Number(settingsRow?.pipe_multiple ?? 3) };
  const repCountry = new Map(refs.reps.map((r) => [r.id as number, r.country_code as string | null]));
  // Objectif des commerciaux filtrés ; pas d'objectif propre aux clients Premium.
  const objective = filters.premium
    ? 0
    : sumObjectives(
        (objectives ?? []).filter(
          (o) =>
            (!filters.porteurs.length || filters.porteurs.includes(o.sales_rep_id)) &&
            (!filters.pays.length || filters.pays.includes(repCountry.get(o.sales_rep_id) ?? "")),
        ),
        months,
      );

  // Avant l'import, les affaires importées sont reconstituées à partir de leur date de closing.
  const history = historyStart ? backfillFromClosing(tl, historyStart) : tl;
  const earliest = earliestDay(history);
  const start = earliest && earliest > from ? earliest : from;
  const importPoint = historyStart ? `${historyStart}T23:59:59.000Z` : null;
  const points = weeklyPoints(start, to, now);
  // Point au jour de l'import, pour séparer la partie reconstituée de la partie lue dans le journal.
  if (importPoint && historyStart! >= start && historyStart! <= to && importPoint < now && !points.includes(importPoint)) {
    points.push(importPoint);
    points.sort();
  }
  const rebuilt = (at: string) => !!historyStart && at.slice(0, 10) < historyStart;
  const rows = points.map((at) => {
    const deals = [...stateAt(history, at).values()].filter(keepState).map(toReportDeal);
    return { at, cov: coverage(deals, objective, trimestre, settings) };
  });
  const first = rows[0];
  const last = rows.at(-1);
  const needed = last?.cov.forecastNeeded ?? 0;
  const delta = (k: "forecast" | "pipe" | "done") => (first && last ? last.cov[k] - first.cov[k] : 0);
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatM(Math.abs(v))}`;
  const labels = rows.map((r, i) => (i === rows.length - 1 && r.at === now ? "auj." : shortDate(r.at)));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Évolution semaine par semaine · {trimestre.replace("-", " ")}</p>
        <h1 className="text-2xl font-extrabold">
          {first && last
            ? `Le forecast ${delta("forecast") >= 0 ? "a gagné" : "a perdu"} ${formatM(Math.abs(delta("forecast")))} XOF depuis le ${longDate(first.at)}`
            : "Pas encore d'historique pour ce trimestre"}
        </h1>
        <p className="text-sm text-zinc-600">
          Chaque point montre le forecast et le pipe du trimestre tels qu&apos;ils étaient à la fin de la semaine.
          {historyStart && rows.some((r) => rebuilt(r.at)) && <> Les points avant le {longDate(historyStart)} sont reconstitués à partir des dates de closing.</>}
        </p>
      </div>

      <FilterBar
        search={false}
        mine={false}
        filters={[{ name: "trimestre", label: "Trimestre", single: true, options: quarterOptions() }, ...commonFilters(refs)]}
      />

      <HistoryNotice missing={historyMissing} />

      {last && (
        <div className="grid gap-3 md:grid-cols-3">
          <Kpi
            label="Forecast aujourd'hui"
            value={`${formatM(last.cov.forecast)} XOF`}
            sub={
              <span className="flex flex-wrap items-center gap-2">
                {needed > 0 && <StatusPill rate={ratio(last.cov.forecast, needed)} kind="cover" />}
                {signed(delta("forecast"))} sur la période
              </span>
            }
          />
          <Kpi label="Pipe aujourd'hui" value={`${formatM(last.cov.pipe)} XOF`} sub={`${signed(delta("pipe"))} sur la période`} />
          <Kpi label="Réalisé aujourd'hui" value={`${formatM(last.cov.done)} XOF`} sub={`${signed(delta("done"))} sur la période`} />
        </div>
      )}

      {rows.length > 0 ? (
        <section className="card space-y-3">
          <Legend
            items={[
              { label: "Pipe", swatch: <SeriesSwatch color={COLORS.pipe} /> },
              { label: "Forecast", swatch: <SeriesSwatch color={COLORS.forecast} /> },
              { label: "Réalisé", swatch: <SeriesSwatch color={COLORS.done} /> },
              ...(needed > 0 ? [{ label: `Forecast minimal (objectif × ${settings.forecast_multiple.toLocaleString("fr-FR")})`, swatch: <SeriesSwatch color={COLORS.needed} dashed /> }] : []),
            ]}
          />
          <LineChart
            labels={labels}
            series={[
              { label: "Pipe", color: COLORS.pipe, values: rows.map((r) => r.cov.pipe) },
              { label: "Forecast", color: COLORS.forecast, values: rows.map((r) => r.cov.forecast), strong: true },
              { label: "Réalisé", color: COLORS.done, values: rows.map((r) => r.cov.done) },
              ...(needed > 0 ? [{ label: "Forecast minimal", color: COLORS.needed, values: rows.map(() => needed), dashed: true }] : []),
            ]}
          />
        </section>
      ) : (
        <div className="card text-sm text-zinc-600">
          L&apos;historique commence le {earliest ? longDate(earliest) : "jour de l'import"} : ce trimestre n&apos;a pas encore de points.
        </div>
      )}

      {rows.length > 0 && (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-100">
                <th className="pb-1.5 text-left font-medium">Fin de semaine</th>
                <th className="pb-1.5 text-right font-medium">Réalisé</th>
                <th className="pb-1.5 text-right font-medium">Forecast</th>
                <th className="pb-1.5 text-right font-medium">Variation</th>
                <th className="pb-1.5 text-right font-medium">Pipe</th>
                <th className="pb-1.5 text-right font-medium">Variation</th>
                <th className="pb-1.5 pl-4 text-left font-medium">Forecast / minimum</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r, i, rev) => {
                const prev = rev[i + 1];
                const df = prev ? r.cov.forecast - prev.cov.forecast : null;
                const dp = prev ? r.cov.pipe - prev.cov.pipe : null;
                const tone = (v: number | null) => (v === null || v === 0 ? "text-zinc-400" : v > 0 ? "text-emerald-700" : "text-red-700");
                return (
                  <tr key={r.at} className="border-b border-zinc-50 tabular-nums last:border-0">
                    <td className="py-2">
                      {r.at === now ? "Aujourd'hui" : longDate(r.at)}
                      {r.at === importPoint && <span className="ml-2 text-xs text-zinc-500">import</span>}
                      {rebuilt(r.at) && <span className="ml-2 text-xs italic text-zinc-400">reconstitué</span>}
                    </td>
                    <td className="py-2 text-right">{formatM(r.cov.done)}</td>
                    <td className="py-2 text-right font-semibold">{formatM(r.cov.forecast)}</td>
                    <td className={`py-2 text-right ${tone(df)}`}>{df === null ? "—" : signed(df)}</td>
                    <td className="py-2 text-right">{formatM(r.cov.pipe)}</td>
                    <td className={`py-2 text-right ${tone(dp)}`}>{dp === null ? "—" : signed(dp)}</td>
                    <td className="py-2 pl-4">{needed > 0 ? <StatusPill rate={ratio(r.cov.forecast, needed)} kind="cover" /> : <span className="text-zinc-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Reconstitué à partir du journal des modifications, qui enregistre chaque changement depuis l&apos;import du {historyStart ? longDate(historyStart) : "fichier"}.
        Avant l&apos;import, chaque affaire importée est comptée dans le statut qu&apos;elle avait à l&apos;import à partir de sa date de closing
        (les affaires sans date de closing ou avec un closing postérieur apparaissent le jour de l&apos;import).
        Mêmes règles que le rapport Pipeline : forecast = réalisé + affaires au stade Forecast, pipe = affaires du trimestre hors perdues et prospection,
        retards du trimestre précédent inclus. Le minimum attendu utilise les objectifs saisis aujourd&apos;hui
        {filters.premium ? " (masqué pour les clients Premium, qui n'ont pas d'objectif propre)" : ""}. Montants en millions de XOF.
      </p>
    </div>
  );
}
