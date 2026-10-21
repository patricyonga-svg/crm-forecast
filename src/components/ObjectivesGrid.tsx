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
              className="input w-16 text-right"
              inputMode="decimal"
            />
            %
          </label>
        ))}
        {phasingTotal !== 100 && <span className="text-red-700">Total {phasingTotal} % (au lieu de 100 %)</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Commercial</th>
              <th className="py-1 pr-3 text-right font-medium">Trimestre</th>
              {months.map((m) => (
                <th key={m.value} className="py-1 pr-3 text-right font-medium capitalize">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => {
              const row = values[r.id];
              const total = row.reduce((s, v) => s + num(v), 0);
              return (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="py-1 pr-3 font-medium">{r.name}</td>
                  <td className="py-1 pr-3">
                    <input
                      key={total}
                      defaultValue={fmt(total)}
                      onBlur={(e) => num(e.target.value) !== total && spread(r.id, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                      className="input w-28 text-right font-semibold"
                      inputMode="decimal"
                      aria-label={`Objectif trimestriel de ${r.name}`}
                    />
                  </td>
                  {months.map((m, i) => (
                    <td key={m.value} className="py-1 pr-3">
                      <input
                        name={`obj_${r.id}_${m.value}`}
                        value={row[i]}
                        onChange={(e) => setValues((v) => ({ ...v, [r.id]: v[r.id].map((x, j) => (j === i ? e.target.value : x)) }))}
                        className="input w-28 text-right"
                        inputMode="decimal"
                        aria-label={`Objectif de ${r.name}, ${m.label}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
