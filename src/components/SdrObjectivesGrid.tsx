"use client";

import { useState } from "react";
import { parseCount, spreadCount } from "@/lib/sdr";

type Metric = "new" | "qual";
const METRICS: { key: Metric; label: string; short: string }[] = [
  { key: "new", label: "Nouveaux leads", short: "Nouv." },
  { key: "qual", label: "Leads qualifiés", short: "Qualif." },
];

type Props = {
  reps: { id: number; name: string }[];
  months: { value: string; label: string }[];
  /** Objectifs existants, par commercial puis par mois. */
  initial: Record<number, Record<string, { new: number; qual: number }>>;
};

const fmt = (n: number) => (n ? String(n) : "");

/** Saisie des objectifs de prospection : nombre de nouveaux leads et de leads qualifiés, par mois ou par trimestre. */
export function SdrObjectivesGrid({ reps, months, initial }: Props) {
  const [phasing, setPhasing] = useState(["30", "30", "40"]);
  const [values, setValues] = useState<Record<number, Record<Metric, string[]>>>(() =>
    Object.fromEntries(
      reps.map((r) => [r.id, { new: months.map((m) => fmt(initial[r.id]?.[m.value]?.new ?? 0)), qual: months.map((m) => fmt(initial[r.id]?.[m.value]?.qual ?? 0)) }]),
    ),
  );
  const phasingNums = phasing.map(parseCount);
  const phasingTotal = phasingNums.reduce((s, p) => s + p, 0);
  const total = (row: string[]) => row.reduce((s, v) => s + parseCount(v), 0);
  const set = (repId: number, metric: Metric, row: string[]) => setValues((v) => ({ ...v, [repId]: { ...v[repId], [metric]: row } }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>Phasage du trimestre utilisé pour répartir les colonnes « Trimestre » :</span>
        {months.map((m, i) => (
          <label key={m.value} className="flex items-center gap-1">
            <span className="capitalize">{m.label}</span>
            <input
              value={phasing[i]}
              onChange={(e) => setPhasing((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
              className="input max-w-16 text-right"
              inputMode="numeric"
            />
            %
          </label>
        ))}
        {phasingTotal !== 100 && <span className="text-red-700">Total {phasingTotal} % (au lieu de 100 %)</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tabular-nums">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-3 text-left font-medium" rowSpan={2}>
                SDR
              </th>
              {[...months, { value: "trimestre", label: "Trimestre" }].map((m) => (
                <th key={m.value} colSpan={2} className="border-l border-zinc-100 px-2 py-1 text-center font-semibold capitalize text-zinc-700">
                  {m.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-zinc-200">
              {[...months, { value: "trimestre" }].flatMap((m) =>
                METRICS.map((x, i) => (
                  <th key={`${m.value}-${x.key}`} title={x.label} className={`px-1 py-1 text-right font-medium ${i === 0 ? "border-l border-zinc-100" : ""}`}>
                    {x.short}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => {
              const row = values[r.id];
              return (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className={`py-1.5 pr-3 font-medium ${total(row.new) + total(row.qual) ? "" : "text-zinc-400"}`}>{r.name}</td>
                  {months.flatMap((m, i) =>
                    METRICS.map((x, k) => (
                      <td key={`${m.value}-${x.key}`} className={`px-1 py-1.5 text-right ${k === 0 ? "border-l border-zinc-100" : ""}`}>
                        <input
                          name={`sdr_${r.id}_${m.value}_${x.key}`}
                          value={row[x.key][i]}
                          placeholder="–"
                          onChange={(e) => set(r.id, x.key, row[x.key].map((v, j) => (j === i ? e.target.value : v)))}
                          className="input w-16 py-1 text-right placeholder:text-zinc-300"
                          inputMode="numeric"
                          aria-label={`${x.label} de ${r.name}, ${m.label}`}
                        />
                      </td>
                    )),
                  )}
                  {METRICS.map((x, k) => {
                    const t = total(row[x.key]);
                    return (
                      <td key={x.key} className={`px-1 py-1.5 text-right ${k === 0 ? "border-l border-zinc-100" : ""}`}>
                        <input
                          key={t}
                          defaultValue={fmt(t)}
                          placeholder="–"
                          onBlur={(e) => parseCount(e.target.value) !== t && set(r.id, x.key, spreadCount(parseCount(e.target.value), phasingNums).map(fmt))}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                          className="input w-16 border-transparent bg-zinc-50 py-1 text-right font-semibold placeholder:text-zinc-300 hover:border-zinc-300 focus:bg-white"
                          inputMode="numeric"
                          title="Saisir un total trimestriel le répartit sur les mois selon le phasage"
                          aria-label={`${x.label} de ${r.name}, trimestre`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50 font-bold">
              <td className="py-2 pl-2 pr-3">Total</td>
              {[...months.map((_, i) => i), -1].flatMap((i) =>
                METRICS.map((x) => (
                  <td key={`${i}-${x.key}`} className="px-1 py-2 pr-4 text-right">
                    {reps.reduce((s, r) => s + (i < 0 ? total(values[r.id][x.key]) : parseCount(values[r.id][x.key][i])), 0)}
                  </td>
                )),
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
