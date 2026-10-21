// Graphiques simples en HTML/CSS, dans le style des présentations SUSU.
import { tone } from "@/lib/reports";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Barre d'atteinte : le fond représente l'objectif, le trait pointillé la part de période écoulée. */
export function ProgressBar({ value, target, marker, color }: { value: number; target: number; marker?: number; color: string }) {
  const rate = target > 0 ? clamp(value / target) : value > 0 ? 1 : 0;
  return (
    <div className="relative h-3 w-full rounded-sm bg-[#e4e7ee]" title={target > 0 ? undefined : "Aucun objectif"}>
      <div className="h-full rounded-sm" style={{ width: `${rate * 100}%`, background: color }} />
      {marker !== undefined && marker > 0 && marker < 1 && (
        <div className="absolute -top-1 -bottom-1 border-l border-dashed border-zinc-900" style={{ left: `${marker * 100}%` }} />
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
  strong,
  light,
}: {
  done?: number;
  value: number;
  needed: number;
  scale: number;
  strong: string;
  light: string;
}) {
  const w = (n: number) => `${clamp(scale > 0 ? n / scale : 0) * 100}%`;
  return (
    <div className="relative h-3 w-full rounded-sm bg-[#e4e7ee]">
      <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: w(value), background: light }} />
      <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: w(Math.min(done, value)), background: strong }} />
      {needed > 0 && <div className="absolute -top-1 -bottom-1 w-0.5 bg-[#14213d]" style={{ left: w(needed) }} />}
    </div>
  );
}

export function Rate({ rate, expected = 1, className = "" }: { rate: number | null; expected?: number; className?: string }) {
  return <span className={`font-bold tabular-nums ${tone(rate, expected)} ${className}`}>{rate === null ? "—" : `${Math.round(rate * 100)} %`}</span>;
}

export function Kpi({ label, value, sub, valueClass = "" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-zinc-500">{sub}</div>}
    </div>
  );
}

export function CountryBadge({ code, color }: { code: string; color: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: color }}>
      {code}
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
  dashed ? <span className="inline-block h-3 border-l border-dashed border-zinc-900" /> : <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />;

export const NeededSwatch = () => <span className="inline-block h-3 w-0.5 bg-[#14213d]" />;
