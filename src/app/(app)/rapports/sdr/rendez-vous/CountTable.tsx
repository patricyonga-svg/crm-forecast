import { Avatar, CountryBadge } from "@/components/charts";
import type { Period } from "@/lib/sdr";

type Row = { key: number; name: string; counts: number[]; extra?: number[] };

export function CountTable({ periods, groups, footer }: { periods: Period[]; groups: { code: string; name: string; rows: Row[] }[]; footer?: { name: string; counts: number[] } }) {
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  return (
    <div className="overflow-x-auto">
      {/* Grille fixe : mêmes largeurs de colonnes pour tous les pays et pour les deux tableaux (SDR et AE). */}
      <table className="w-full min-w-[640px] table-fixed text-sm tabular-nums">
        <colgroup>
          <col className="w-40 sm:w-52" />
          {periods.map((p) => (
            <col key={p.key} />
          ))}
          <col className="w-16" />
        </colgroup>
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-200">
            <th className="py-1.5 pr-3 text-left font-medium">Commercial</th>
            {periods.map((p, i) => (
              <th key={p.key} className={`px-2 py-1.5 text-right font-medium ${i === periods.length - 1 ? "text-zinc-900" : ""}`} title={`${p.from} → ${p.to}`}>
                {p.label}
              </th>
            ))}
            <th className="py-1.5 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.code}>
            <tr>
              <td colSpan={periods.length + 2} className="pb-1 pt-3">
                <span className="flex items-center gap-2 font-bold">
                  <CountryBadge code={g.code} />
                  {g.name}
                </span>
              </td>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.key} className="border-b border-zinc-100">
                <td className="py-1.5 pr-3">
                  <span className="flex min-w-0 items-center gap-2 font-medium" title={r.name}>
                    <Avatar name={r.name} size="sm" />
                    <span className="truncate">{r.name}</span>
                  </span>
                </td>
                {r.counts.map((n, i) => (
                  <td key={periods[i].key} className={`px-2 py-1.5 text-right ${i === periods.length - 1 ? "bg-blue-50/50 font-bold" : ""} ${n ? "" : "text-zinc-300"}`}>
                    {n}
                    {!!r.extra?.[i] && <span className="ml-1 text-xs font-normal text-zinc-400">+{r.extra[i]}</span>}
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right font-semibold">{sum(r.counts)}</td>
              </tr>
            ))}
            <tr className="bg-zinc-50 font-bold">
              <td className="truncate py-1.5 pl-2 pr-3" title={`Total ${g.name}`}>
                Total {g.name}
              </td>
              {periods.map((p, i) => (
                <td key={p.key} className="px-2 py-1.5 text-right">
                  {g.rows.reduce((s, r) => s + r.counts[i], 0)}
                </td>
              ))}
              <td className="py-1.5 pl-3 text-right">{g.rows.reduce((s, r) => s + sum(r.counts), 0)}</td>
            </tr>
          </tbody>
        ))}
        {footer && sum(footer.counts) > 0 && (
          <tfoot>
            <tr className="text-zinc-500">
              <td className="py-2 pr-3 italic">{footer.name}</td>
              {footer.counts.map((n, i) => (
                <td key={periods[i].key} className="px-2 py-2 text-right">
                  {n}
                </td>
              ))}
              <td className="py-2 pl-3 text-right">{sum(footer.counts)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
