import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { Kpi, Legend, Swatch } from "@/components/charts";
import { Dot, StackedColumns } from "@/components/history-charts";
import { dealTitle, formatDate } from "@/lib/domain";
import { collectionMonths, daysBetween, dueDate, fullyCollectedAt } from "@/lib/history";
import { formatM } from "@/lib/reports";
import { commonFilters, loadHistory, type Param } from "../history-data";

type Search = { pays?: Param; porteur?: Param; premium?: Param };

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });
const PARTS = [
  { key: "collected", label: "Encaissé", color: "#14213d" },
  { key: "late", label: "En retard", color: "#d64545" },
  { key: "due", label: "À encaisser (Won Pending)", color: "#b7c3dc" },
  { key: "forecast", label: "Forecast pas encore facturé", color: "#b7c3dc", pattern: true },
];

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, refs, deals, tl, keep, clientById, repName, today } = await loadHistory(params);

  const thisMonth = `${today.slice(0, 7)}-01`;
  const months = Array.from({ length: 7 }, (_, i) => shiftMonth(thisMonth, i - 2));
  const scoped = deals.filter(keep);
  const { data: payments } = await supabase.from("payments").select("deal_id, paid_on, amount").gte("paid_on", months[0]).limit(5000);
  const wonDates = new Map<string, string>();
  for (const d of scoped) {
    const at = d.stage === "won" ? fullyCollectedAt(tl.get(d.id) ?? []) : null;
    if (at) wonDates.set(d.id, at);
  }
  const { buckets, undated } = collectionMonths(months, scoped, payments ?? [], wonDates, today);

  const pending = scoped
    .filter((d) => d.stage === "won_pending" && Number(d.quote_amount) > Number(d.collected_amount))
    .map((d) => {
      const due = dueDate(d);
      return { ...d, due, rest: Number(d.quote_amount) - Number(d.collected_amount), late: due ? (due < today ? daysBetween(due, today) : 0) : null };
    })
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const totalRest = pending.reduce((s, d) => s + d.rest, 0);
  const lateRest = pending.filter((d) => d.late).reduce((s, d) => s + d.rest, 0);
  const current = buckets[2];
  const next30 = pending.filter((d) => d.due && d.due >= today && daysBetween(today, d.due) <= 30).reduce((s, d) => s + d.rest, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Encaissements par mois</p>
        <h1 className="text-2xl font-extrabold">
          {formatM(totalRest)} XOF facturés restent à encaisser, dont {formatM(lateRest)} en retard
        </h1>
        <p className="text-sm text-zinc-600">Par mois d&apos;encaissement prévu : ce qui est déjà encaissé, ce qui reste attendu et ce qui est en retard.</p>
      </div>

      <FilterBar search={false} mine={false} filters={commonFilters(refs)} />

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Encaissé ce mois-ci" value={`${formatM(current.collected)} XOF`} sub={`${formatM(current.due + current.late)} XOF encore attendus ce mois`} />
        <Kpi label="Attendu sous 30 jours" value={`${formatM(next30)} XOF`} sub="Won Pending dont la date prévue arrive" />
        <Kpi
          label="En retard"
          value={`${formatM(lateRest)} XOF`}
          valueClass={lateRest > 0 ? "text-red-700" : ""}
          sub={`${pending.filter((d) => d.late).length} affaire(s) à relancer`}
        />
      </div>

      <section className="card space-y-4">
        <Legend items={PARTS.map((p) => ({ label: p.label, swatch: p.pattern ? <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `repeating-linear-gradient(135deg, ${p.color} 0 3px, #fff 3px 5px)` }} /> : <Swatch color={p.color} /> }))} />
        <StackedColumns
          highlight={2}
          parts={PARTS}
          columns={buckets.map((b) => ({ label: MONTH.format(new Date(`${b.month}T12:00:00Z`)), values: b as unknown as Record<string, number> }))}
        />
        {undated.count > 0 && (
          <p className="text-xs text-zinc-500">
            {undated.count} Won Pending sans date de closing ni date d&apos;encaissement ({formatM(undated.amount)} XOF) ne figurent pas dans le graphique.
          </p>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-bold">Won Pending à encaisser</h2>
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-40" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-32" />
          </colgroup>
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th />
              <th className="pb-1.5 text-left font-medium">Affaire</th>
              <th className="pb-1.5 text-left font-medium">Commercial</th>
              <th className="pb-1.5 text-right font-medium">Facturé</th>
              <th className="pb-1.5 text-right font-medium">Encaissé</th>
              <th className="pb-1.5 text-right font-medium">Reste</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Prévu le</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((d) => {
              const client = clientById.get(d.client_id)?.name;
              return (
                <tr key={d.id} className="border-b border-zinc-50 tabular-nums last:border-0">
                  <td className="py-2">
                    <Dot tone={d.late ? "bad" : d.late === null ? "warn" : "ok"} />
                  </td>
                  <td className="py-2 pr-2">
                    <Link href={`/affaires/${d.id}`} className="block truncate font-semibold hover:underline">
                      {dealTitle(d, client)}
                    </Link>
                    {d.name && <span className="block truncate text-xs text-zinc-500">{client}</span>}
                  </td>
                  <td className="truncate py-2">{d.sales_rep_id ? repName.get(d.sales_rep_id) : "Sans commercial"}</td>
                  <td className="py-2 text-right">{formatM(Number(d.quote_amount))}</td>
                  <td className="py-2 text-right">{Number(d.collected_amount) > 0 ? formatM(Number(d.collected_amount)) : "—"}</td>
                  <td className="py-2 text-right font-semibold">{formatM(d.rest)}</td>
                  <td className="py-2 pl-4">
                    {d.due ? formatDate(d.due) : "—"}
                    {!!d.late && <span className="block text-xs font-semibold text-red-700">{d.late} j de retard</span>}
                    {d.due && !d.expected_payment_date && <span className="block text-xs text-zinc-400">closing + 30 j</span>}
                  </td>
                </tr>
              );
            })}
            {pending.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-zinc-500">
                  Aucun Won Pending à encaisser.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Date prévue = date prévisionnelle d&apos;encaissement de l&apos;affaire, sinon date de closing + 30 jours (même règle que l&apos;étiquette
        « Encaissement en retard » du pipe). Encaissé = paiements saisis, plus le solde des affaires passées en Won à la date de ce passage.
        Les retards restent dans le mois où ils étaient attendus (ou dans le premier mois affiché s&apos;ils sont plus anciens). Montants en millions de XOF.
      </p>
    </div>
  );
}
