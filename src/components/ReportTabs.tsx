"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/rapports", label: "Synthèse" },
  { href: "/rapports/realisations", label: "Réalisations" },
  { href: "/rapports/pipeline", label: "Pipeline" },
  { href: "/rapports/entonnoir", label: "Entonnoir" },
];

export function ReportTabs() {
  const pathname = usePathname();
  const trimestre = useSearchParams().get("trimestre");
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200">
      {TABS.map((t) => {
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
