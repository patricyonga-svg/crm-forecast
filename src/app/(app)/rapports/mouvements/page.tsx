import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { HistoryNotice } from "@/components/history-charts";
import { Legend, Swatch } from "@/components/charts";
import { Waterfall, type Step } from "@/components/history-charts";
import { dealTitle, quarterRange } from "@/lib/domain";
import { MOVE_KINDS, pipeMoves, stateAt, type MoveKind } from "@/lib/history";
import { formatM, monthEnd } from "@/lib/reports";
import { commonFilters, list, loadHistory, longDate, type Param } from "../history-data";

type Search = { periode?: Param; pays?: Param; porteur?: Param; premium?: Param };

const KIND_STYLE: Record<MoveKind, Step["kind"]> = {
  nouvelles: "up",
  reouvertes: "up",
  hausses: "up",
  baisses: "down",
  gagnees: "won",
  perdues: "lost",
  autres: "other",
};
const SHORT: Record<MoveKind, string> = {
  nouvelles: "Nouvelles",
  reouvertes: "Réouvertes",
  hausses: "Hausses",
  baisses: "Baisses",
  gagnees: "Gagnées",
  perdues: "Perdues",
  autres: "Autres",
};
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

/** Périodes proposées : chaque mois depuis le début de l'historique, puis les trimestres concernés. */
function periods(historyStart: string, today: string) {
  const months: string[] = [];
  for (let m = `${historyStart.slice(0, 7)}-01`; m <= today; ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  }
  const quarters = [...new Set(months.map((m) => `${m.slice(0, 4)}-T${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`))];
  return [
    ...months.reverse().map((m) => ({ value: m.slice(0, 7), label: MONTH.format(new Date(`${m}T12:00:00Z`)), from: m, to: monthEnd(m) })),
    ...quarters.reverse().map((q) => ({ value: q, label: q.replace("-", " "), ...quarterRange(q) })),
  ];
}

export default async function MovesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { refs, tl, historyStart, keepState, deals, clientById, repName, now, today, historyMissing } = await loadHistory(params);
  const options = periods(historyStart ?? today, today);
  const period = options.find((o) => list(params.periode).includes(o.value)) ?? options[0];

  const fromImport = !historyStart || period.from <= historyStart;
  const startAt = fromImport ? `${historyStart ?? today}T23:59:59Z` : `${period.from}T00:00:00Z`;
  const endAt = new Date(Math.min(Date.parse(`${period.to}T23:59:59Z`), Date.parse(now))).toISOString();
  const moves = pipeMoves(stateAt(tl, startAt), stateAt(tl, endAt), keepState);
  const diff = moves.end - moves.start;

  const byId = new Map(deals.map((d) => [d.id, d]));
  const steps: Step[] = [
    { label: `Pipe au ${longDate(startAt)}`, value: moves.start, kind: "total" },
    ...MOVE_KINDS.filter((k) => moves.kinds[k.key].deals.length > 0).map((k) => ({
      label: SHORT[k.key],
      value: moves.kinds[k.key].amount,
      kind: KIND_STYLE[k.key],
      href: `#${k.key}`,
    })),
    { label: endAt.slice(0, 10) === today ? "Pipe aujourd'hui" : `Pipe au ${longDate(endAt)}`, value: moves.end, kind: "total" },
  ];
  const biggestOut = (["gagnees", "perdues", "baisses", "autres"] as const)
    .map((k) => ({ k, v: moves.kinds[k].amount }))
    .sort((a, b) => a.v - b.v)[0];
  const biggestIn = (["nouvelles", "reouvertes", "hausses"] as const).map((k) => ({ k, v: moves.kinds[k].amount })).sort((a, b) => b.v - a.v)[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Mouvements du pipe ouvert · {period.label}</p>
        <h1 className="text-2xl font-extrabold">
          Le pipe {diff >= 0 ? "a augmenté" : "a baissé"} de {formatM(Math.abs(diff))} XOF, de {formatM(moves.start)} à {formatM(moves.end)}
        </h1>
        <p className="text-sm text-zinc-600">
          {biggestIn.v > 0 && <>Principale entrée : {SHORT[biggestIn.k].toLowerCase()} (+{formatM(biggestIn.v)}). </>}
          {biggestOut.v < 0 && <>Principale sortie : {SHORT[biggestOut.k].toLowerCase()} (−{formatM(-biggestOut.v)}).</>}
        </p>
      </div>

      <FilterBar
        search={false}
        mine={false}
        filters={[{ name: "periode", label: "Période", single: true, options: options.map((o) => ({ value: o.value, label: o.label })) }, ...commonFilters(refs)]}
      />

      <HistoryNotice missing={historyMissing} />

      <section className="card space-y-4">
        <Legend
          items={[
            { label: "Pipe", swatch: <Swatch color="#14213d" /> },
            { label: "Entrées", swatch: <Swatch color="#2a78d6" /> },
            { label: "Baisses de montant", swatch: <Swatch color="#f2b134" /> },
            { label: "Gagnées", swatch: <Swatch color="#1baf7a" /> },
            { label: "Perdues", swatch: <Swatch color="#d64545" /> },
            { label: "Autres sorties", swatch: <Swatch color="#9aa3b5" /> },
          ]}
        />
        <Waterfall steps={steps} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {MOVE_KINDS.filter((k) => moves.kinds[k.key].deals.length > 0).map((k) => {
          const m = moves.kinds[k.key];
          return (
            <section key={k.key} id={k.key} className="card space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold">{k.label}</h2>
                <span className="text-sm font-semibold tabular-nums">
                  {m.amount > 0 ? "+" : "−"}
                  {formatM(Math.abs(m.amount))} · {m.deals.length} affaire{m.deals.length > 1 ? "s" : ""}
                </span>
              </div>
              <ul className="divide-y divide-zinc-50 text-sm">
                {m.deals.slice(0, 8).map((d) => {
                  const deal = byId.get(d.id);
                  const client = deal ? clientById.get(deal.client_id)?.name : undefined;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        {deal ? (
                          <Link href={`/affaires/${d.id}`} className="block truncate font-medium hover:underline">
                            {dealTitle(deal, client)}
                          </Link>
                        ) : (
                          <span className="block truncate text-zinc-500">Affaire supprimée</span>
                        )}
                        <span className="block truncate text-xs text-zinc-500">
                          {client && deal?.name ? `${client} · ` : ""}
                          {deal?.sales_rep_id ? repName.get(deal.sales_rep_id) : "Sans commercial"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {d.amount > 0 ? "+" : "−"}
                        {formatM(Math.abs(d.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {m.deals.length > 8 && <p className="text-xs text-zinc-500">et {m.deals.length - 8} autres affaires</p>}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        Pipe ouvert = affaires en Opportunité, À relancer et Forecast, toutes dates de closing confondues. Nouvelles = créées ou sorties de la prospection ;
        réouvertes = revenues d&apos;un état Perdu ou Won ; gagnées = passées en Won Pending ou Won ; autres = retours en prospection, suppressions et
        changements de commercial ou de pays (avec un filtre). Reconstitué à partir du journal des modifications
        {fromImport && historyStart ? `, qui commence le ${longDate(historyStart)}` : ""}. Montants en millions de XOF.
      </p>
    </div>
  );
}
