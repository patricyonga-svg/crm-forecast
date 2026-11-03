"use client";

import { useState } from "react";

type Props = {
  reps: { id: number; name: string }[];
  months: { value: string; label: string }[];
  /** Objectifs existants en millions de XOF, par commercial puis par mois. */
  initial: Record<number, Record<string, number>>;
};

const fmt = (n: number) => (n ? String(Math.round(n * 100) / 100).replace(".", ",") : "");
const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;

export function ObjectivesGrid({ reps, months, initial }: Props) {
  const [phasing, setPhasing] = useState(["30", "30", "40"]);
  const [values, setValues] = useState<Record<number, string[]>>(() =>
    Object.fromEntries(reps.map((r) => [r.id, months.map((m) => fmt(initial[r.id]?.[m.value] ?? 0))])),
  );
  const phasingTotal = phasing.reduce((s, p) => s + num(p), 0);

  // Répartit l'objectif trimestriel selon le phasage ; le dernier mois prend l'arrondi.
  function spread(repId: number, total: string) {
    const t = num(total);
    const parts = phasing.map((p) => Math.round(((t * num(p)) / (phasingTotal || 100)) * 100) / 100);
    parts[parts.length - 1] = Math.round((t - parts.slice(0, -1).reduce((a, b) => a + b, 0)) * 100) / 100;
    setValues((v) => ({ ...v, [repId]: parts.map(fmt) }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>Phasage du trimestre utilisé pour répartir la colonne « Trimestre » :</span>
        {months.map((m, i) => (
          <label key={m.value} className="flex items-center gap-1">
            <span className="capitalize">{m.label}</span>
            <input
              value={phasing[i]}
              onChange={(e) => setPhasing((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
              className="input max-w-16 text-right"
              inputMode="decimal"
            />
            %
          </label>
        ))}
        {phasingTotal !== 100 && <span className="text-red-700">Total {phasingTotal} % (au lieu de 100 %)</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="py-1.5 pr-3 text-left font-medium">Commercial</th>
              {months.map((m) => (
                <th key={m.value} className="w-28 px-2 py-1.5 text-right font-medium capitalize">
                  {m.label}
                </th>
              ))}
              <th className="w-32 py-1.5 pl-4 text-right font-medium">Trimestre</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => {
              const row = values[r.id];
              const total = row.reduce((s, v) => s + num(v), 0);
              return (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className={`py-1.5 pr-3 font-medium ${total ? "" : "text-zinc-400"}`}>{r.name}</td>
                  {months.map((m, i) => (
                    <td key={m.value} className="px-2 py-1.5 text-right">
                      <input
                        name={`obj_${r.id}_${m.value}`}
                        value={row[i]}
                        placeholder="–"
                        onChange={(e) => setValues((v) => ({ ...v, [r.id]: v[r.id].map((x, j) => (j === i ? e.target.value : x)) }))}
                        className="input w-24 py-1 text-right placeholder:text-zinc-300"
                        inputMode="decimal"
                        aria-label={`Objectif de ${r.name}, ${m.label}`}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pl-4 text-right">
                    <input
                      key={total}
                      defaultValue={fmt(total)}
                      placeholder="–"
                      onBlur={(e) => num(e.target.value) !== total && spread(r.id, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                      className="input w-24 border-transparent bg-zinc-50 py-1 text-right font-semibold placeholder:text-zinc-300 hover:border-zinc-300 focus:bg-white"
                      inputMode="decimal"
                      title="Saisir un total trimestriel le répartit sur les mois selon le phasage"
                      aria-label={`Objectif trimestriel de ${r.name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50 font-bold">
              <td className="py-2 pl-2 pr-3">Total</td>
              {months.map((m, i) => (
                <td key={m.value} className="px-2 py-2 pr-5 text-right">
                  {fmt(reps.reduce((s, r) => s + num(values[r.id][i]), 0)) || "0"}
                </td>
              ))}
              <td className="py-2 pl-4 pr-5 text-right">{fmt(reps.reduce((s, r) => s + values[r.id].reduce((t, v) => t + num(v), 0), 0)) || "0"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
