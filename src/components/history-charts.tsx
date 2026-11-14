// Graphiques des rapports historiques, en SVG et HTML rendus côté serveur, dans le style des autres rapports :
// bleu nuit pour les montants, orange pour l'objectif ou le minimum attendu, vert / ambre / rouge réservés à l'état.
import { formatM } from "@/lib/reports";

export type Series = { label: string; color: string; values: number[]; dashed?: boolean; strong?: boolean };

/** Graduations « rondes » de 0 à au moins `max`. */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Courbes sur des points datés, avec la valeur de chaque courbe inscrite au bout. */
export function LineChart({ labels, series, height = 280 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 760;
  const H = height;
  const pad = { l: 52, r: 96, t: 14, b: 30 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ys = ticks(max);
  const top = ys.at(-1)!;
  const x = (i: number) => pad.l + (labels.length > 1 ? (i / (labels.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r) / 2);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  // Étiquettes de fin, écartées pour ne pas se chevaucher.
  const ends = series
    .map((s) => ({ s, y: y(s.values.at(-1) ?? 0) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ s: Series; y: number }[]>((acc, e) => [...acc, { ...e, y: acc.length ? Math.max(e.y, acc.at(-1)!.y + 15) : e.y }], []);
  const every = Math.ceil(labels.length / 8);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Évolution">
        {ys.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e6e8ee" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">
              {formatM(v)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === labels.length - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-500 text-[11px]">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={s.strong ? 3 : 2}
              strokeDasharray={s.dashed ? "6 5" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {!s.dashed &&
              s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={s.strong ? 3.5 : 2.5} fill="white" stroke={s.color} strokeWidth={2}>
                  <title>{`${s.label} · ${labels[i]} : ${formatM(v)} XOF`}</title>
                </circle>
              ))}
          </g>
        ))}
        {ends.map(({ s, y: ey }) => (
          <text key={s.label} x={W - pad.r + 8} y={ey + 4} className="text-[12px] font-bold" fill={s.color}>
            {formatM(s.values.at(-1) ?? 0)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export type Step = { label: string; value: number; kind: "total" | "up" | "down" | "won" | "lost" | "other"; href?: string };

const STEP_COLOR: Record<Step["kind"], string> = {
  total: "#14213d",
  up: "#2a78d6",
  down: "#f2b134",
  won: "#1baf7a",
  lost: "#d64545",
  other: "#9aa3b5",
};

/** Cascade : barres flottantes du total de départ au total d'arrivée. */
export function Waterfall({ steps }: { steps: Step[] }) {
  let running = 0;
  const bars = steps.map((s) => {
    if (s.kind === "total") {
      running = s.value;
      return { ...s, low: 0, high: s.value };
    }
    const from = running;
    running += s.value;
    return { ...s, low: Math.min(from, running), high: Math.max(from, running) };
  });
  // L'axe ne part pas de zéro : sinon les mouvements, petits face au pipe, seraient invisibles.
  const max = Math.max(1, ...bars.map((b) => b.high));
  const lowest = Math.min(...bars.map((b) => (b.kind === "total" ? b.high : b.low)));
  const floor = Math.max(0, lowest - (max - lowest) * 1.5);
  const H = 220;
  const pct = (v: number) => (Math.max(0, v - floor) / (max - floor)) * 88;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[620px] gap-2" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b, i) => (
          <div key={i} className="flex flex-col items-stretch">
            <div className="relative" style={{ height: H }}>
              <div
                className="absolute inset-x-1 rounded-sm"
                style={{ bottom: `${pct(b.low)}%`, height: `max(${pct(b.high) - pct(b.low)}%, 2px)`, background: STEP_COLOR[b.kind] }}
                title={`${b.label} : ${formatM(b.value)} XOF`}
              />
              <div className="absolute inset-x-0 text-center text-xs font-bold tabular-nums" style={{ bottom: `calc(${pct(b.high)}% + 4px)`, color: b.kind === "total" ? "#14213d" : STEP_COLOR[b.kind] }}>
                {b.kind === "total" ? formatM(b.value) : `${b.value > 0 ? "+" : b.value < 0 ? "−" : ""}${formatM(Math.abs(b.value))}`}
              </div>
            </div>
            <div className="mt-2 border-t border-zinc-200 pt-1.5 text-center text-xs leading-tight text-zinc-600">
              {b.href ? (
                <a href={b.href} className="hover:underline">
                  {b.label}
                </a>
              ) : (
                b.label
              )}
            </div>
          </div>
        ))}
      </div>
      {floor > 0 && <p className="mt-2 text-xs text-zinc-400">L&apos;axe commence à {formatM(floor)} pour rendre les mouvements lisibles.</p>}
    </div>
  );
}

export type StackPart = { key: string; label: string; color: string; pattern?: boolean };

/** Barres empilées verticales (une par mois). */
export function StackedColumns({
  columns,
  parts,
  highlight,
}: {
  columns: { label: string; values: Record<string, number> }[];
  parts: StackPart[];
  highlight?: number;
}) {
  const totals = columns.map((c) => parts.reduce((s, p) => s + (c.values[p.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const H = 220;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[560px] gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((c, i) => (
          <div key={c.label} className="flex flex-col">
            <div className="relative flex flex-col justify-end" style={{ height: H }}>
              <div className="mb-1 text-center text-xs font-bold tabular-nums text-[#14213d]">{totals[i] > 0 ? formatM(totals[i]) : ""}</div>
              <div className="mx-auto flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(totals[i] / max) * 85}%` }}>
                {parts.map((p) => {
                  const v = c.values[p.key] ?? 0;
                  if (v <= 0) return null;
                  return (
                    <div
                      key={p.key}
                      title={`${c.label} · ${p.label} : ${formatM(v)} XOF`}
                      style={{
                        height: `${(v / totals[i]) * 100}%`,
                        background: p.pattern ? `repeating-linear-gradient(135deg, ${p.color} 0 4px, #fff 4px 7px)` : p.color,
                      }}
                      className="border-t border-white/70 first:border-t-0"
                    />
                  );
                })}
              </div>
            </div>
            <div className={`mt-1.5 border-t pt-1 text-center text-xs ${i === highlight ? "border-[#14213d] font-bold text-[#14213d]" : "border-zinc-200 text-zinc-600"}`}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Petite barre horizontale avec sa valeur, sur une échelle commune. */
export function HBar({ value, max, color = "#14213d", label }: { value: number | null; max: number; color?: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-full bg-[#e6e8ee]">
        {value !== null && <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100}%`, background: color }} />}
      </div>
      <span className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${value === null ? "text-zinc-400" : ""}`}>{label}</span>
    </div>
  );
}

export function SeriesSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
  ) : (
    <span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} />
  );
}

/** Pastille de couleur d'état (vert, ambre, rouge). */
export function Dot({ tone }: { tone: "ok" | "warn" | "bad" }) {
  const c = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-red-600";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c}`} aria-hidden />;
}
