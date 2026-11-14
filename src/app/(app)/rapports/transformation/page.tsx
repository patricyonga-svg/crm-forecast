import { FilterBar } from "@/components/FilterBar";
import { HistoryNotice } from "@/components/history-charts";
import { Avatar, CountryBadge, Kpi } from "@/components/charts";
import { HBar } from "@/components/history-charts";
import { currentQuarter, quarterRange, type Stage } from "@/lib/domain";
import { conversion, daysBetween, median, wonAt } from "@/lib/history";
import { formatM } from "@/lib/reports";
import { commonFilters, list, loadHistory, quarterOptions, type HistoryDeal, type Param } from "../history-data";

type Search = { trimestre?: Param; pays?: Param; porteur?: Param; premium?: Param };

const DECIDED: Stage[] = ["won", "won_pending", "perdu"];
const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)} %`);

export default async function ConversionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const trimestre = list(params.trimestre).find((t) => /^\d{4}-T[1-4]$/.test(t)) ?? currentQuarter();
  const { from, to } = quarterRange(trimestre);
  const { refs, deals, tl, keep, repName, historyMissing } = await loadHistory(params);

  const decided = deals.filter((d) => keep(d) && DECIDED.includes(d.stage) && d.expected_close_date && d.expected_close_date >= from && d.expected_close_date <= to);

  /** Durée du cycle : de la création (ou de la qualification du lead) à la facturation, pour les affaires créées dans Cerise. */
  const cycleDays = (ds: HistoryDeal[]) =>
    ds.flatMap((d) => {
      if (d.sheet_row !== null || (d.stage !== "won" && d.stage !== "won_pending")) return [];
      const won = wonAt(tl.get(d.id) ?? []);
      return won ? [daysBetween(d.qualified_at ?? d.created_at, won)] : [];
    });

  const repCountry = new Map(refs.reps.map((r) => [r.id as number, r.country_code as string | null]));
  const byRep = new Map<number | null, HistoryDeal[]>();
  for (const d of decided) byRep.set(d.sales_rep_id, [...(byRep.get(d.sales_rep_id) ?? []), d]);
  const rows = [...byRep.entries()]
    .map(([id, ds]) => {
      const cycles = cycleDays(ds);
      return { id, name: id ? (repName.get(id) ?? "Commercial inconnu") : "Sans commercial", country: id ? repCountry.get(id) : null, conv: conversion(ds), cycle: median(cycles), cycles: cycles.length };
    })
    .sort((a, b) => (b.conv.rate ?? -1) - (a.conv.rate ?? -1) || b.conv.won + b.conv.lost - (a.conv.won + a.conv.lost));
  const team = conversion(decided);
  const teamCycles = cycleDays(decided);
  const teamCycle = median(teamCycles);
  const maxCycle = Math.max(1, ...rows.map((r) => r.cycle ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Taux de transformation et durée du cycle · {trimestre.replace("-", " ")}</p>
        <h1 className="text-2xl font-extrabold">
          {team.rate === null ? "Aucune affaire gagnée ou perdue sur la période" : `${pct(team.rate)} des affaires tranchées sont gagnées (${pct(team.amountRate)} en montant)`}
        </h1>
        <p className="text-sm text-zinc-600">Affaires gagnées ou perdues dont la date de closing tombe dans le trimestre.</p>
      </div>

      <FilterBar
        search={false}
        mine={false}
        filters={[{ name: "trimestre", label: "Trimestre", single: true, options: quarterOptions() }, ...commonFilters(refs)]}
      />

      <HistoryNotice missing={historyMissing} />

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Gagnées" value={team.won} sub={`${formatM(team.wonAmount)} XOF`} />
        <Kpi label="Perdues" value={team.lost} sub={`${formatM(team.lostAmount)} XOF`} />
        <Kpi
          label="Durée médiane du cycle"
          value={teamCycle === null ? "—" : `${teamCycle} jours`}
          sub={teamCycles.length ? `sur ${teamCycles.length} affaire${teamCycles.length > 1 ? "s" : ""} créée${teamCycles.length > 1 ? "s" : ""} dans Cerise` : "pas encore d'affaire créée et gagnée dans Cerise"}
        />
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-56" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th className="pb-1.5 text-left font-medium">Commercial</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Transformation (en nombre)</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Transformation (en montant)</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Durée du cycle (médiane)</th>
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
                  <HBar value={r.conv.rate} max={1} label={pct(r.conv.rate)} />
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {r.conv.won} gagnée{r.conv.won > 1 ? "s" : ""} · {r.conv.lost} perdue{r.conv.lost > 1 ? "s" : ""}
                  </div>
                </td>
                <td className="py-2.5 pl-4">
                  <HBar value={r.conv.amountRate} max={1} label={pct(r.conv.amountRate)} />
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {formatM(r.conv.wonAmount)} gagnés sur {formatM(r.conv.wonAmount + r.conv.lostAmount)}
                  </div>
                </td>
                <td className="py-2.5 pl-4">
                  <HBar value={r.cycle} max={maxCycle} color="#2a78d6" label={r.cycle === null ? "—" : `${r.cycle} j`} />
                  <div className="mt-0.5 text-xs text-zinc-500">{r.cycles ? `sur ${r.cycles} affaire${r.cycles > 1 ? "s" : ""}` : "pas encore mesurable"}</div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-zinc-500">
                  Aucune affaire gagnée ou perdue sur la période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Transformation = gagnées (Won Pending + Won) ÷ (gagnées + perdues), les affaires encore en cours ne comptent pas. Durée du cycle = jours entre la
        création de l&apos;affaire (ou sa qualification, pour un lead venu de la prospection) et son passage en Won Pending ou Won. Elle ne peut être
        mesurée que pour les affaires créées dans Cerise : la date de création des affaires importées du fichier n&apos;est pas connue. Montants en millions de XOF.
      </p>
    </div>
  );
}
