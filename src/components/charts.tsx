// Graphiques simples en HTML/CSS, dans le style des présentations SUSU.
// Les barres sont en bleu nuit ; la couleur (vert / ambre / rouge) est réservée à l'état : en avance, à surveiller, en retard.
import { initials, status, type Status } from "@/lib/reports";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Trait orange « où l'on devrait être à cette date ». */
export const PRORATA_COLOR = "#eb6834";

/** Barre d'atteinte : le fond représente l'objectif, le trait orange la part de période écoulée. */
export function ProgressBar({
  value,
  target,
  marker,
  color = "#14213d",
  thick,
}: {
  value: number;
  target: number;
  marker?: number;
  color?: string;
  thick?: boolean;
}) {
  const rate = target > 0 ? clamp(value / target) : value > 0 ? 1 : 0;
  return (
    <div className={`relative w-full rounded-full bg-[#e6e8ee] ${thick ? "h-3.5" : "h-2.5"}`} title={target > 0 ? undefined : "Aucun objectif"}>
      <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: color }} />
      {marker !== undefined && marker > 0 && marker < 1 && (
        <div className="absolute -top-1 -bottom-1 w-0.5 rounded" style={{ left: `${marker * 100}%`, background: PRORATA_COLOR }} title="Prorata à date" />
      )}
    </div>
  );
}

/** Réalisé + forecast face au minimum attendu (trait vertical), sur une échelle commune. */
export function CoverageBar({
  done = 0,
  value,
  needed,
  scale,
  strong = "#14213d",
  light = "#b7c3dc",
}: {
  done?: number;
  value: number;
  needed: number;
  scale: number;
  strong?: string;
  light?: string;
}) {
  const w = (n: number) => `${clamp(scale > 0 ? n / scale : 0) * 100}%`;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-[#e6e8ee]">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(value), background: light }} />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(Math.min(done, value)), background: strong }} />
      {needed > 0 && <div className="absolute -top-1 -bottom-1 w-0.5 rounded" style={{ left: `calc(${w(needed)} - 1px)`, background: PRORATA_COLOR }} />}
    </div>
  );
}

const DOT: Record<Status, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-600" };

/** Taux en chiffres neutres, précédé d'une pastille de couleur selon l'état. */
export function Rate({ rate, expected = 1, className = "" }: { rate: number | null; expected?: number; className?: string }) {
  const s = status(rate, expected);
  if (rate === null) return <span className={`text-zinc-400 ${className}`}>—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold tabular-nums ${className}`}>
      {s && <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[s]}`} aria-hidden />}
      {Math.round(rate * 100)} %
    </span>
  );
}

const PILL: Record<Status, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  bad: "bg-red-50 text-red-800 ring-red-200",
};
const LABELS = {
  pace: { ok: "Dans le rythme", warn: "À surveiller", bad: "En retard" },
  cover: { ok: "Couvert", warn: "Juste", bad: "Insuffisant" },
  target: { ok: "Atteint", warn: "À surveiller", bad: "En retard" },
} as const;

/** Étiquette d'état : « Dans le rythme / À surveiller / En retard » ou « Couvert / Juste / Insuffisant ». */
export function StatusPill({
  rate,
  expected = 1,
  kind = "pace",
  title,
}: {
  rate: number | null;
  expected?: number;
  kind?: keyof typeof LABELS;
  title?: string;
}) {
  const s = status(rate, expected);
  if (!s) return <span className="inline-flex whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Pas d&apos;objectif</span>;
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${PILL[s]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s]}`} aria-hidden />
      {LABELS[kind][s]}
    </span>
  );
}

export function Kpi({ label, value, sub, valueClass = "" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-zinc-500">{sub}</div>}
    </div>
  );
}

export function CountryBadge({ code }: { code: string; color?: string }) {
  return <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-700">{code}</span>;
}

/** Pastille ronde avec les initiales d'un commercial. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      title={name}
      className={`inline-grid shrink-0 place-items-center rounded-full bg-[#dfe6f3] font-bold text-[#14213d] ${size === "sm" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]"}`}
    >
      {initials(name)}
    </span>
  );
}

export function Legend({ items }: { items: { label: string; swatch: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.swatch}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const Swatch = ({ color, dashed }: { color?: string; dashed?: boolean }) =>
  dashed ? <span className="inline-block h-3 w-0.5 rounded" style={{ background: PRORATA_COLOR }} /> : <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />;

export const NeededSwatch = () => <span className="inline-block h-3 w-0.5 rounded" style={{ background: PRORATA_COLOR }} />;
