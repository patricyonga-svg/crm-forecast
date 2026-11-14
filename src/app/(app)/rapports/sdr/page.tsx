import Link from "next/link";
import { QuarterPicker } from "@/components/QuarterPicker";
import { CountryBadge, Legend, ProgressBar, Rate, StatusPill, Swatch } from "@/components/charts";
import { elapsed, monthEnd, ratio } from "@/lib/reports";
import { currentQuarter, quarterRange } from "@/lib/domain";
import { day, leadCounts, sdrObjective } from "@/lib/sdr";
import { monthLabel, pickMonth } from "../data";
import { byCountry, loadSdrLeads, sdrReps } from "./data";

type Search = { trimestre?: string; mois?: string };

/** Réalisations des SDR : nouveaux leads et leads qualifiés, face aux objectifs mensuel et trimestriel. */
export default async function SdrAchievementsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const trimestre = params.trimestre && /^\d{4}-T[1-4]$/.test(params.trimestre) ? params.trimestre : currentQuarter();
  const { from, to, months } = quarterRange(trimestre);
  const { profile, refs, deals, objectives } = await loadSdrLeads(from, to);
  const month = pickMonth(months, params.mois);
  const mEnd = monthEnd(month);
  const mName = monthLabel(month);
  const monthElapsed = elapsed(month, mEnd);
  const quarterElapsed = elapsed(from, to);

  const inQuarter = (ts: string | null) => !!day(ts) && day(ts)! >= from && day(ts)! <= to;
  const active = [...objectives.map((o) => o.sales_rep_id), ...deals.filter((d) => inQuarter(d.created_at) || inQuarter(d.qualified_at)).map((d) => d.sdr_id!)];
  const rows = sdrReps(refs.reps, active).map((r) => {
    const m = leadCounts(deals, r.id, month, mEnd);
    const q = leadCounts(deals, r.id, from, to);
    return { ...r, m, q, mObj: sdrObjective(objectives, r.id, [month]), qObj: sdrObjective(objectives, r.id, months) };
  });
  const groups = byCountry(refs.countries, rows).map((g) => {
    const sum = (pick: (r: (typeof rows)[number]) => number) => g.items.reduce((s, r) => s + pick(r), 0);
    return {
      ...g,
      t: {
        mNew: sum((r) => r.m.newLeads),
        mNewObj: sum((r) => r.mObj.newLeads),
        mQual: sum((r) => r.m.qualified),
        mQualObj: sum((r) => r.mObj.qualified),
        qNew: sum((r) => r.q.newLeads),
        qNewObj: sum((r) => r.qObj.newLeads),
        qQual: sum((r) => r.q.qualified),
        qQualObj: sum((r) => r.qObj.qualified),
      },
    };
  });
  const all = (k: keyof (typeof groups)[number]["t"]) => groups.reduce((s, g) => s + g.t[k], 0);
  const canEdit = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Réalisations SDR par pays · objectifs mensuel et trimestriel</p>
          <h1 className="text-2xl font-extrabold">
            {all("mQual")} leads qualifiés en {mName} sur {all("mQualObj")} attendus · {all("mNew")} nouveaux leads sur {all("mNewObj")}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm">
            {months.map((m) => (
              <Link key={m} href={`?trimestre=${trimestre}&mois=${m}`} className={`px-3 py-2 capitalize ${m === month ? "bg-[#14213d] text-white" : "hover:bg-zinc-50"}`}>
                {monthLabel(m)}
              </Link>
            ))}
          </div>
          <QuarterPicker value={trimestre} />
        </div>
      </div>

      <Legend
        items={[
          { label: "Réalisé", swatch: <Swatch color="#14213d" /> },
          { label: "Objectif", swatch: <Swatch color="#e6e8ee" /> },
          { label: "Prorata à date", swatch: <Swatch dashed /> },
        ]}
      />

      {groups.length === 0 && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Aucun SDR pour l&apos;instant. Un administrateur donne le rôle « Commercial - SDR » dans Utilisateurs
          {canEdit && (
            <>
              , puis les objectifs se saisissent dans{" "}
              <Link href={`/parametres/objectifs-sdr?trimestre=${trimestre}`} className="underline">
                Paramètres › Objectifs SDR
              </Link>
            </>
          )}
          .
        </p>
      )}

      <div className="grid grid-cols-1 gap-4">
        {groups.map((g) => (
          <section key={g.code} className="card space-y-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CountryBadge code={g.code} />
                {g.name}
              </h2>
              <p className="text-sm text-zinc-600">
                {mName} : {g.t.mNew} / {g.t.mNewObj} nouveaux leads · {g.t.mQual} / {g.t.mQualObj} qualifiés — trimestre : {g.t.qNew} / {g.t.qNewObj} nouveaux ·{" "}
                {g.t.qQual} / {g.t.qQualObj} qualifiés
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="pb-1 text-left font-medium">SDR</th>
                    <th className="pb-1 text-left font-medium">Nouveaux leads · {mName}</th>
                    <th className="pb-1 text-right font-medium">Mois</th>
                    <th className="pb-1 text-right font-medium">Trim.</th>
                    <th className="pb-1 pl-4 text-left font-medium">Leads qualifiés · {mName}</th>
                    <th className="pb-1 text-right font-medium">Mois</th>
                    <th className="pb-1 text-right font-medium">Trim.</th>
                    <th className="pb-1 text-right font-medium">État du trimestre</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="py-2 pr-2 font-semibold">{r.display_name}</td>
                      <td className="w-1/5 py-2 pr-2">
                        <ProgressBar value={r.m.newLeads} target={r.mObj.newLeads} marker={monthElapsed} />
                        <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">
                          {r.m.newLeads} sur {r.mObj.newLeads} · trimestre {r.q.newLeads} sur {r.qObj.newLeads}
                        </div>
                      </td>
                      <td className="py-2 pl-1 text-right">
                        <Rate rate={ratio(r.m.newLeads, r.mObj.newLeads)} expected={monthElapsed || 1} />
                      </td>
                      <td className="py-2 pl-1 text-right text-zinc-600">
                        <Rate rate={ratio(r.q.newLeads, r.qObj.newLeads)} expected={quarterElapsed || 1} />
                      </td>
                      <td className="w-1/5 py-2 pl-4 pr-2">
                        <ProgressBar value={r.m.qualified} target={r.mObj.qualified} marker={monthElapsed} />
                        <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">
                          {r.m.qualified} sur {r.mObj.qualified} · trimestre {r.q.qualified} sur {r.qObj.qualified}
                        </div>
                      </td>
                      <td className="py-2 pl-1 text-right">
                        <Rate rate={ratio(r.m.qualified, r.mObj.qualified)} expected={monthElapsed || 1} />
                      </td>
                      <td className="py-2 pl-1 text-right text-zinc-600">
                        <Rate rate={ratio(r.q.qualified, r.qObj.qualified)} expected={quarterElapsed || 1} />
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <StatusPill rate={ratio(r.q.qualified, r.qObj.qualified)} expected={quarterElapsed || 1} title="Leads qualifiés du trimestre face au prorata de l'objectif" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        Nouveau lead = affaire créée avec ce SDR (champ « SDR » de l&apos;affaire), comptée à sa date de création · lead qualifié = affaire de ce SDR passée
        de la prospection à « Opportunité » ou au-delà, comptée à la date du passage · pays du SDR · pastille verte à partir du prorata de la période écoulée
        (trait orange), ambre à partir de la moitié, rouge en dessous.
      </p>
    </div>
  );
}
