import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { Kpi, Legend, Swatch } from "@/components/charts";
import { Dot, StackedColumns } from "@/components/history-charts";
import { addDays, dealTitle, formatDate } from "@/lib/domain";
import { daysBetween, dueDate } from "@/lib/history";
import { formatM } from "@/lib/reports";
import { commonFilters, list, loadHistory, shortDate, type Param } from "../../history-data";

type Search = { pays?: Param; porteur?: Param; premium?: Param; horizon?: Param; par?: Param };

const HORIZONS = [4, 8, 12];
const PARTS = [
  { key: "late", label: "En retard (date dépassée)", color: "#d64545" },
  { key: "set", label: "Date d'encaissement saisie", color: "#14213d" },
  { key: "estimated", label: "Date estimée (closing + 30 j)", color: "#14213d", pattern: true },
];

/** Lundi de la semaine d'une date (AAAA-MM-JJ). */
function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

type Row = { key: string; label: string; late: number; weeks: number[]; later: number; undated: number; total: number };

export default async function UpcomingCollectionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { refs, deals, keep, clientById, repName, today } = await loadHistory(params);
  const horizon = HORIZONS.includes(Number(list(params.horizon)[0])) ? Number(list(params.horizon)[0]) : 8;
  const byCountry = list(params.par)[0] === "pays";
  const countryName = new Map(refs.countries.map((c) => [c.code as string, c.name as string]));

  const monday = mondayOf(today);
  const weeks = Array.from({ length: horizon }, (_, i) => {
    const from = addDays(monday, 7 * i);
    return { from, to: addDays(from, 6), label: i === 0 ? "Cette sem." : `Sem. du ${shortDate(from)}` };
  });
  const end = weeks[weeks.length - 1].to;

  // Won Pending avec un reste à encaisser, placés dans la semaine de leur date prévue.
  const pending = deals
    .filter(keep)
    .filter((d) => d.stage === "won_pending" && Number(d.quote_amount) > Number(d.collected_amount))
    .map((d) => {
      const due = dueDate(d);
      const rest = Number(d.quote_amount) - Number(d.collected_amount);
      const week = due && due >= today && due <= end ? Math.floor(daysBetween(monday, due) / 7) : null;
      const slot: "late" | "week" | "later" | "undated" = !due ? "undated" : due < today ? "late" : week !== null ? "week" : "later";
      return { ...d, due, rest, week, slot, estimated: !d.expected_payment_date };
    })
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const sum = (rows: typeof pending) => rows.reduce((s, d) => s + d.rest, 0);
  const late = pending.filter((d) => d.slot === "late");
  const inHorizon = pending.filter((d) => d.slot === "week");
  const later = pending.filter((d) => d.slot === "later");
  const undated = pending.filter((d) => d.slot === "undated");
  const thisWeek = inHorizon.filter((d) => d.week === 0);

  const columns: { label: string; values: Record<string, number> }[] = [
    { label: "En retard", values: { late: sum(late) } },
    ...weeks.map((w, i) => {
      const rows = inHorizon.filter((d) => d.week === i);
      return { label: w.label, values: { set: sum(rows.filter((d) => !d.estimated)), estimated: sum(rows.filter((d) => d.estimated)) } };
    }),
  ];

  // Tableau croisé : une ligne par commercial (ou par pays), une colonne par semaine.
  const groupKey = (d: (typeof pending)[number]) => (byCountry ? d.country_code : d.sales_rep_id !== null ? String(d.sales_rep_id) : "none");
  const groupLabel = (k: string) => (byCountry ? (countryName.get(k) ?? k) : k === "none" ? "Sans commercial" : (repName.get(Number(k)) ?? k));
  const groups = new Map<string, Row>();
  for (const d of pending) {
    const k = groupKey(d);
    const row = groups.get(k) ?? { key: k, label: groupLabel(k), late: 0, weeks: weeks.map(() => 0), later: 0, undated: 0, total: 0 };
    if (d.slot === "late") row.late += d.rest;
    else if (d.slot === "week") row.weeks[d.week!] += d.rest;
    else if (d.slot === "later") row.later += d.rest;
    else row.undated += d.rest;
    row.total += d.rest;
    groups.set(k, row);
  }
  const rows = [...groups.values()].sort((a, b) => b.total - a.total);
  const totalRow: Row = {
    key: "total",
    label: "Total",
    late: sum(late),
    weeks: columns.slice(1).map((c) => (c.values.set ?? 0) + (c.values.estimated ?? 0)),
    later: sum(later),
    undated: sum(undated),
    total: sum(pending),
  };
  const cell = (v: number) => (v > 0 ? formatM(v) : "—");

  const toggleHref = (par: string | null) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const x of list(v as Param)) if (k !== "par") p.append(k, x);
    if (par) p.set("par", par);
    const s = p.toString();
    return `/rapports/encaissements/a-venir${s ? `?${s}` : ""}`;
  };

  // Détail : semaine par semaine (retards en tête).
  const sections = [
    { title: "En retard", rows: late, tone: "late" },
    ...weeks.map((w, i) => ({ title: i === 0 ? `Cette semaine (${shortDate(w.from)} – ${shortDate(w.to)})` : `Semaine du ${shortDate(w.from)} au ${shortDate(w.to)}`, rows: inHorizon.filter((d) => d.week === i), tone: "week" })),
    { title: `Après le ${shortDate(end)}`, rows: later, tone: "week" },
    { title: "Sans date prévue", rows: undated, tone: "undated" },
  ].filter((s) => s.rows.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Encaissements à venir</p>
        <h1 className="text-2xl font-extrabold">
          {formatM(sum(inHorizon))} XOF attendus sur les {horizon} prochaines semaines, plus {formatM(sum(late))} en retard
        </h1>
        <p className="text-sm text-zinc-600">Reste à encaisser des affaires en Won Pending, semaine par semaine selon la date d&apos;encaissement prévue.</p>
      </div>

      <FilterBar
        search={false}
        mine={false}
        filters={[
          ...commonFilters(refs),
          { name: "horizon", label: "Horizon", single: true, options: HORIZONS.map((h) => ({ value: String(h), label: `${h} semaines` })) },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Cette semaine" value={`${formatM(sum(thisWeek))} XOF`} sub={`${thisWeek.length} affaire(s) d'ici dimanche`} />
        <Kpi label={`Sur ${horizon} semaines`} value={`${formatM(sum(inHorizon))} XOF`} sub={`${inHorizon.length} affaire(s), jusqu'au ${shortDate(end)}`} />
        <Kpi
          label="En retard"
          value={`${formatM(sum(late))} XOF`}
          valueClass={late.length > 0 ? "text-red-700" : ""}
          sub={`${late.length} affaire(s) à relancer`}
        />
      </div>

      <section className="card space-y-4">
        <Legend
          items={PARTS.map((p) => ({
            label: p.label,
            swatch: p.pattern ? (
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `repeating-linear-gradient(135deg, ${p.color} 0 3px, #fff 3px 5px)` }} />
            ) : (
              <Swatch color={p.color} />
            ),
          }))}
        />
        <StackedColumns highlight={1} parts={PARTS} columns={columns} />
        {(later.length > 0 || undated.length > 0) && (
          <p className="text-xs text-zinc-500">
            Hors graphique : {formatM(sum(later))} XOF prévus après le {shortDate(end)}
            {undated.length > 0 && <>, et {formatM(sum(undated))} XOF sans aucune date ({undated.length} affaire(s))</>}.
          </p>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Par {byCountry ? "pays" : "commercial"} et par semaine</h2>
          <div className="flex gap-1 text-xs">
            {[
              { label: "Par commercial", href: toggleHref(null), on: !byCountry },
              { label: "Par pays", href: toggleHref("pays"), on: byCountry },
            ].map((t) => (
              <Link key={t.label} href={t.href} scroll={false} className={`rounded-full border px-3 py-1 font-semibold ${t.on ? "border-[#14213d] bg-[#14213d] text-white" : "border-zinc-200 text-zinc-600 hover:border-zinc-400"}`}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
        <table className="w-full text-sm tabular-nums" style={{ minWidth: 300 + (horizon + 3) * 76 }}>
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th className="pb-1.5 text-left font-medium">{byCountry ? "Pays" : "Commercial"}</th>
              <th className="pb-1.5 text-right font-medium text-red-700">En retard</th>
              {weeks.map((w, i) => (
                <th key={w.from} className={`pb-1.5 text-right font-medium ${i === 0 ? "text-[#14213d]" : ""}`}>
                  {i === 0 ? "Cette sem." : shortDate(w.from)}
                </th>
              ))}
              <th className="pb-1.5 text-right font-medium">Plus tard</th>
              <th className="pb-1.5 text-right font-medium">Sans date</th>
              <th className="pb-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...rows, ...(rows.length ? [totalRow] : [])].map((r) => (
              <tr key={r.key} className={`border-b border-zinc-50 last:border-0 ${r.key === "total" ? "border-t border-zinc-200 font-bold" : ""}`}>
                <td className="truncate py-2 pr-2">{r.label}</td>
                <td className={`py-2 text-right ${r.late > 0 ? "text-red-700" : "text-zinc-400"}`}>{cell(r.late)}</td>
                {r.weeks.map((v, i) => (
                  <td key={i} className={`py-2 text-right ${v > 0 ? "" : "text-zinc-400"}`}>
                    {cell(v)}
                  </td>
                ))}
                <td className={`py-2 text-right ${r.later > 0 ? "" : "text-zinc-400"}`}>{cell(r.later)}</td>
                <td className={`py-2 text-right ${r.undated > 0 ? "text-amber-700" : "text-zinc-400"}`}>{cell(r.undated)}</td>
                <td className="py-2 text-right font-semibold">{cell(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={horizon + 5} className="py-3 text-zinc-500">
                  Aucun Won Pending à encaisser.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {sections.length > 0 && (
        <section className="card space-y-5">
          <h2 className="font-bold">Détail semaine par semaine</h2>
          {sections.map((s) => (
            <div key={s.title}>
              <div className={`mb-1 flex items-baseline justify-between border-b pb-1 text-sm font-bold ${s.tone === "late" ? "border-red-200 text-red-700" : "border-zinc-200"}`}>
                <span>{s.title}</span>
                <span className="tabular-nums">{formatM(sum(s.rows))} XOF</span>
              </div>
              <table className="w-full table-fixed text-sm">
                <tbody>
                  {s.rows.map((d) => {
                    const client = clientById.get(d.client_id)?.name;
                    return (
                      <tr key={d.id} className="border-b border-zinc-50 tabular-nums last:border-0">
                        <td className="w-6 py-1.5">
                          <Dot tone={d.slot === "late" ? "bad" : d.slot === "undated" || d.estimated ? "warn" : "ok"} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Link href={`/affaires/${d.id}`} className="block truncate font-semibold hover:underline">
                            {dealTitle(d, client)}
                          </Link>
                          {d.name && <span className="block truncate text-xs text-zinc-500">{client}</span>}
                          <span className="block truncate text-xs text-zinc-500 sm:hidden">
                            {d.sales_rep_id ? repName.get(d.sales_rep_id) : "Sans commercial"} · {d.country_code}
                          </span>
                        </td>
                        <td className="hidden w-40 truncate py-1.5 sm:table-cell">{d.sales_rep_id ? repName.get(d.sales_rep_id) : "Sans commercial"}</td>
                        <td className="hidden w-14 py-1.5 text-xs font-bold text-zinc-600 sm:table-cell">{d.country_code}</td>
                        <td className="w-16 py-1.5 text-right font-semibold sm:w-24">{formatM(d.rest)}</td>
                        <td className="w-28 py-1.5 pl-3 sm:w-32 sm:pl-4">
                          {d.due ? formatDate(d.due) : "—"}
                          {d.slot === "late" && <span className="block text-xs font-semibold text-red-700">{daysBetween(d.due!, today)} j de retard</span>}
                          {d.due && d.estimated && <span className="block text-xs text-zinc-400">closing + 30 j</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Reste à encaisser = montant facturé moins ce qui est déjà encaissé, pour chaque affaire en Won Pending. Semaine = du lundi au dimanche, selon la date
        prévisionnelle d&apos;encaissement de l&apos;affaire, sinon sa date de closing + 30 jours (point orange). Une date déjà passée compte en retard.
        Montants en millions de XOF.
      </p>
    </div>
  );
}
