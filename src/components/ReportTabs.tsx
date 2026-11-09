"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const AE_TABS = [
  { href: "/rapports", label: "Synthèse" },
  { href: "/rapports/realisations", label: "Réalisations" },
  { href: "/rapports/pipeline", label: "Pipeline" },
  { href: "/rapports/entonnoir", label: "Entonnoir" },
];

const SDR_TABS = [
  { href: "/rapports/sdr", label: "Réalisations SDR" },
  { href: "/rapports/sdr/rendez-vous", label: "Rendez-vous" },
];

/** Onglets du rapport AE (ventes) ou du rapport SDR (prospection), selon la page. */
export function ReportTabs() {
  const pathname = usePathname();
  const trimestre = useSearchParams().get("trimestre");
  const sdr = pathname.startsWith("/rapports/sdr");
  const tabs = sdr ? SDR_TABS : AE_TABS;
  return (
    <nav className="flex items-end gap-1 overflow-x-auto border-b border-zinc-200">
      <span className="mr-2 whitespace-nowrap px-1 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400">{sdr ? "Rapport SDR" : "Rapport AE"}</span>
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={trimestre ? `${t.href}?trimestre=${trimestre}` : t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${active ? "border-[#2a78d6] text-[#14213d]" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
