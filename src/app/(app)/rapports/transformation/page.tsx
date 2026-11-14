import { FilterBar } from "@/components/FilterBar";
import { Avatar, CountryBadge, Kpi, Legend, Swatch } from "@/components/charts";
import { HistoryNotice } from "@/components/history-charts";
import { currentQuarter } from "@/lib/domain";
import { cohortStats, pipeCohort, type CohortDeal, type CohortStats } from "@/lib/history";
import { formatM } from "@/lib/reports";
import { commonFilters, list, loadHistory, longDate, periods, type Param } from "../history-data";

type Search = { periode?: Param; pays?: Param; porteur?: Param; premium?: Param };

const COLORS = { won: "#1baf7a", lost: "#d64545", open: "#b7c3dc", out: "#9aa3b5" };
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} %` : "—");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Barre du pipe d'un commercial : longueur = volume du pipe, découpée selon ce que sont devenues les affaires. */
function PipeBar({ s, scale }: { s: CohortStats; scale: number }) {
  const w = (v: number) => `${scale > 0 ? (v / scale) * 100 : 0}%`;
  const parts = [
    { v: s.wonAmount, c: COLORS.won, l: "Gagné" },
    { v: s.lostAmount, c: COLORS.lost, l: "Perdu" },
    { v: s.openAmount, c: COLORS.open, l: "En cours" },
    { v: s.outAmount, c: COLORS.out, l: "Sorti" },
  ];
  return (
    <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[#f1f2f5]">
      {parts.map((p) => (p.v > 0 ? <div key={p.l} style={{ width: w(p.v), background: p.c }} title={`${p.l} : ${formatM(p.v)} XOF`} className="h-full border-r border-white last:border-r-0" /> : null))}
    </div>
  );
}

export default async function ConversionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { refs, tl, keepState, repName, historyStart, historyMissing, now, today } = await loadHistory(params);
  const options = periods(historyStart ?? today, today);
  const period = options.find((o) => list(params.periode).includes(o.value)) ?? options.find((o) => o.value === currentQuarter()) ?? options[0];

  const fromImport = !historyStart || period.from <= historyStart;
  const startAt = fromImport ? `${historyStart ?? today}T23:59:59Z` : `${period.from}T00:00:00Z`;
  const endAt = new Date(Math.min(Date.parse(`${period.to}T23:59:59Z`), Date.parse(now))).toISOString();
  const cohort = pipeCohort(tl, startAt, endAt, fromImport ? period.from : undefined).filter((d) => keepState(d.state));

  const repCountry = new Map(refs.reps.map((r) => [r.id as number, r.country_code as string | null]));
  const byRep = new Map<number | null, CohortDeal[]>();
  for (const d of cohort) byRep.set(d.state.sales_rep_id, [...(byRep.get(d.state.sales_rep_id) ?? []), d]);
  const rows = [...byRep.entries()]
    .map(([id, ds]) => ({ id, name: id ? (repName.get(id) ?? "Commercial inconnu") : "Sans commercial", country: id ? repCountry.get(id) : null, s: cohortStats(ds) }))
    .sort((a, b) => b.s.amount - a.s.amount);
  const team = cohortStats(cohort);
  const scale = Math.max(1, ...rows.map((r) => r.s.amount));
  const ongoing = endAt.slice(0, 10) === today;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Transformation du pipe · {period.label}</p>
        <h1 className="text-2xl font-extrabold">
          {team.count === 0
            ? "Aucune affaire dans le pipe sur cette période"
            : `Sur ${formatM(team.amount)} XOF de pipe, ${formatM(team.wonAmount)} ont été gagnés (${pct(team.wonAmount, team.amount)})`}
        </h1>
        <p className="text-sm text-zinc-600">
          Pipe de la période = affaires ouvertes au {longDate(startAt)}
          {fromImport && historyStart ? " (début de l'historique), affaires déjà gagnées ou perdues avec un closing depuis le " + longDate(period.from) : ""} et
          affaires entrées dans le pipe ou tranchées jusqu&apos;au {ongoing ? "jour" : longDate(endAt)}. On regarde ensuite ce qu&apos;elles sont devenues.
        </p>
      </div>

      <FilterBar
        search={false}
        mine={false}
        filters={[{ name: "periode", label: "Période", single: true, options: options.map((o) => ({ value: o.value, label: o.label })) }, ...commonFilters(refs)]}
      />

      <HistoryNotice missing={historyMissing} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Pipe de la période" value={`${formatM(team.amount)} XOF`} sub={plural(team.count, "affaire")} />
        <Kpi
          label="Gagné"
          value={`${formatM(team.wonAmount)} XOF`}
          sub={`${plural(team.won, "affaire")} · ${pct(team.won, team.count)} en nombre, ${pct(team.wonAmount, team.amount)} en CA`}
        />
        <Kpi label="Perdu" value={`${formatM(team.lostAmount)} XOF`} sub={`${plural(team.lost, "affaire")} · ${pct(team.lostAmount, team.amount)} du CA`} />
        <Kpi label="Encore en cours" value={`${formatM(team.openAmount)} XOF`} sub={`${plural(team.open, "affaire")} · ${pct(team.openAmount, team.amount)} du CA`} />
      </div>

      <section className="card space-y-3 overflow-x-auto">
        <Legend
          items={[
            { label: "Gagné", swatch: <Swatch color={COLORS.won} /> },
            { label: "Perdu", swatch: <Swatch color={COLORS.lost} /> },
            { label: "Encore en cours", swatch: <Swatch color={COLORS.open} /> },
            { label: "Sorti du pipe (retour en prospection, supprimé)", swatch: <Swatch color={COLORS.out} /> },
          ]}
        />
        <table className="w-full min-w-[820px] table-fixed text-sm">
          <colgroup>
            <col className="w-52" />
            <col />
            <col className="w-36" />
            <col className="w-32" />
            <col className="w-32" />
          </colgroup>
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th className="pb-1.5 text-left font-medium">Commercial</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Pipe de la période et ce qu&apos;il est devenu</th>
              <th className="pb-1.5 pl-4 text-right font-medium">Pipe</th>
              <th className="pb-1.5 pl-4 text-right font-medium">Taux en nombre</th>
              <th className="pb-1.5 pl-4 text-right font-medium">Taux en CA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? "none"} className="border-b border-zinc-50 last:border-0">
                <td className="py-2.5 pr-2">
                  <span className="flex min-w-0 items-center gap-2 font-semibold" title={r.name}>
                    <Avatar name={r.name} />
                    <span className="truncate">{r.name}</span>
                    {r.country && <CountryBadge code={r.country} />}
                  </span>
                </td>
                <td className="py-2.5 pl-4">
                  <PipeBar s={r.s} scale={scale} />
                  <div className="mt-1 text-xs text-zinc-500 tabular-nums">
                    {formatM(r.s.wonAmount)} gagnés · {formatM(r.s.lostAmount)} perdus · {formatM(r.s.openAmount)} en cours
                  </div>
                </td>
                <td className="py-2.5 pl-4 text-right tabular-nums">
                  <div className="font-semibold">{formatM(r.s.amount)}</div>
                  <div className="text-xs text-zinc-500">{plural(r.s.count, "affaire")}</div>
                </td>
                <td className="py-2.5 pl-4 text-right tabular-nums">
                  <div className="font-semibold">{pct(r.s.won, r.s.count)}</div>
                  <div className="text-xs text-zinc-500">
                    {r.s.won} sur {r.s.count}
                  </div>
                </td>
                <td className="py-2.5 pl-4 text-right tabular-nums">
                  <div className="font-semibold">{pct(r.s.wonAmount, r.s.amount)}</div>
                  <div className="text-xs text-zinc-500">
                    {formatM(r.s.wonAmount)} sur {formatM(r.s.amount)}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-zinc-500">
                  Aucune affaire dans le pipe sur cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Pipe = affaires en Opportunité, À relancer ou Forecast. Taux de transformation = affaires gagnées (passées en Won Pending ou Won avant la fin de la
        période) ÷ toutes les affaires du pipe de la période, en nombre et en chiffre d&apos;affaires. Montant et commercial retenus : ceux de la fin de la
        période. {ongoing ? "La période n'est pas terminée : une partie du pipe est encore en cours et peut encore être gagnée. " : ""}
        Reconstitué à partir du journal des modifications{historyStart ? `, qui commence le ${longDate(historyStart)}` : ""}. Montants en millions de XOF.
      </p>
    </div>
  );
}
