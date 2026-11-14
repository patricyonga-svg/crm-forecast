import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { HistoryNotice } from "@/components/history-charts";
import { Avatar } from "@/components/charts";
import { Dot } from "@/components/history-charts";
import { StageBadge } from "@/components/StageBadge";
import { dealTitle, formatDate, STAGE_ACCENT, STAGE_LABEL, type Stage } from "@/lib/domain";
import { daysBetween, stageSince } from "@/lib/history";
import { formatM } from "@/lib/reports";
import { commonFilters, list, loadHistory, longDate, type Param } from "../history-data";

type Search = { seuil?: Param; etape?: Param; pays?: Param; porteur?: Param; premium?: Param };

const WATCHED: Stage[] = ["opportunite", "a_relancer", "forecast", "won_pending"];
const THRESHOLDS = [7, 14, 21, 30, 45, 60, 90];
const DEFAULT_THRESHOLD = 21;

export default async function StagnationPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const seuil = Number(list(params.seuil).find((s) => THRESHOLDS.includes(Number(s))) ?? DEFAULT_THRESHOLD);
  const etapes = list(params.etape).filter((s): s is Stage => WATCHED.includes(s as Stage));
  const { refs, deals, tl, keep, clientById, repName, now, today, historyStart, historyMissing } = await loadHistory(params);

  const rows = deals
    .filter((d) => WATCHED.includes(d.stage) && keep(d))
    .map((d) => {
      const s = stageSince(tl.get(d.id) ?? []);
      const since = s?.since ?? d.created_at;
      const atLeast = !!s?.fromFirstEvent && d.sheet_row !== null; // importée sans changement d'étape depuis
      const days = daysBetween(since, now);
      const tone: "ok" | "warn" | "bad" = days < seuil ? "ok" : days < seuil * 2 ? "warn" : "bad";
      return { ...d, since, atLeast, days, tone };
    });
  const perStage = WATCHED.map((stage) => {
    const all = rows.filter((r) => r.stage === stage);
    const stuck = all.filter((r) => r.days >= seuil);
    return { stage, total: all.length, stuck: stuck.length, amount: stuck.reduce((s, r) => s + Number(r.quote_amount), 0) };
  });
  const shown = rows
    .filter((r) => r.days >= seuil && (!etapes.length || etapes.includes(r.stage)))
    .sort((a, b) => b.days - a.days || Number(b.quote_amount) - Number(a.quote_amount));
  const amount = shown.reduce((s, r) => s + Number(r.quote_amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Affaires qui stagnent · même étape depuis {seuil} jours ou plus</p>
        <h1 className="text-2xl font-extrabold">
          {shown.length} affaire{shown.length > 1 ? "s" : ""} à relancer, {formatM(amount)} XOF
        </h1>
        <p className="text-sm text-zinc-600">
          Point orange : bloquée depuis {seuil} à {seuil * 2 - 1} jours · point rouge : {seuil * 2} jours ou plus.
        </p>
      </div>

      <FilterBar
        search={false}
        mine={false}
        filters={[
          { name: "seuil", label: "Bloquées depuis", single: true, options: THRESHOLDS.map((t) => ({ value: String(t), label: `${t} jours et plus` })) },
          { name: "etape", label: "Étape", options: WATCHED.map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
          ...commonFilters(refs),
        ]}
      />

      <HistoryNotice missing={historyMissing} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {perStage.map((p) => (
          <div key={p.stage} className="card border-l-4" style={{ borderLeftColor: STAGE_ACCENT[p.stage] }}>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{STAGE_LABEL[p.stage]}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {p.stuck} <span className="text-base font-semibold text-zinc-500">/ {p.total}</span>
            </div>
            <div className="mt-1 text-sm text-zinc-500">{p.stuck ? `${formatM(p.amount)} XOF bloqués` : "rien de bloqué"}</div>
          </div>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed text-sm">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-44" />
            <col className="w-32" />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-56" />
          </colgroup>
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th />
              <th className="pb-1.5 text-left font-medium">Affaire</th>
              <th className="pb-1.5 text-left font-medium">Commercial</th>
              <th className="pb-1.5 text-left font-medium">Étape</th>
              <th className="pb-1.5 text-right font-medium">Montant</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Dans l&apos;étape</th>
              <th className="pb-1.5 pl-4 text-left font-medium">Prochaine action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const client = clientById.get(r.client_id)?.name;
              const rep = r.sales_rep_id ? repName.get(r.sales_rep_id) : undefined;
              const overdue = r.next_action_date && r.next_action_date < today;
              return (
                <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                  <td className="py-2">
                    <Dot tone={r.tone} />
                  </td>
                  <td className="py-2 pr-2">
                    <Link href={`/affaires/${r.id}`} className="block truncate font-semibold hover:underline">
                      {dealTitle(r, client)}
                    </Link>
                    {r.name && <span className="block truncate text-xs text-zinc-500">{client}</span>}
                  </td>
                  <td className="py-2 pr-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={rep ?? "?"} size="sm" />
                      <span className="truncate">{rep ?? "Sans commercial"}</span>
                    </span>
                  </td>
                  <td className="py-2">
                    <StageBadge stage={r.stage} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatM(Number(r.quote_amount))}</td>
                  <td className="py-2 pl-4 tabular-nums">
                    <span className="font-semibold">
                      {r.atLeast ? "≥ " : ""}
                      {r.days} j
                    </span>
                    <span className="block text-xs text-zinc-500">{r.atLeast ? "depuis l'import" : `depuis le ${formatDate(r.since.slice(0, 10))}`}</span>
                  </td>
                  <td className="py-2 pl-4">
                    {r.next_action ? (
                      <>
                        <span className="line-clamp-1" title={r.next_action}>
                          {r.next_action}
                        </span>
                        <span className={`block text-xs ${overdue ? "font-semibold text-red-700" : "text-zinc-500"}`}>
                          {r.next_action_date ? `${overdue ? "en retard · " : ""}${formatDate(r.next_action_date)}` : "sans date"}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-red-700">Aucune action prévue</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-zinc-500">
                  Aucune affaire bloquée depuis {seuil} jours ou plus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Durée dans l&apos;étape = temps écoulé depuis le dernier changement d&apos;étape, d&apos;après le journal des modifications. Pour les affaires
        importées qui n&apos;ont pas changé d&apos;étape depuis, la durée réelle est inconnue : elle est comptée à partir de l&apos;import
        {historyStart ? ` du ${longDate(historyStart)}` : ""} (« ≥ »). Une modification du montant ou d&apos;une note ne remet pas le compteur à zéro.
      </p>
    </div>
  );
}
