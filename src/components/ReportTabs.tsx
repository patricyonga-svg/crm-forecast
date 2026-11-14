"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { currentReport, REPORT_GROUPS } from "@/lib/report-menu";

/**
 * Navigation des rapports sur téléphone (sur ordinateur, c'est le menu « Rapports ») :
 * une ligne de familles, puis les rapports de la famille affichée.
 */
export function ReportTabs() {
  const pathname = usePathname();
  const trimestre = useSearchParams().get("trimestre");
  const current = currentReport(pathname);
  const link = (href: string) => (trimestre ? `${href}?trimestre=${trimestre}` : href);
  return (
    <div className="space-y-2 md:hidden">
      <nav aria-label="Familles de rapports" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {REPORT_GROUPS.map((g) => {
          const active = current?.group.label === g.label;
          return (
            <Link
              key={g.label}
              href={link(g.reports[0].href)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${active ? "border-brand-navy bg-brand-navy text-white" : "border-zinc-300 bg-white text-zinc-700"}`}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>
      {current && current.group.reports.length > 1 && (
        <nav aria-label={current.group.label} className="flex items-end gap-1 overflow-x-auto border-b border-zinc-200">
          {current.group.reports.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={link(t.href)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${active ? "border-[#2a78d6] text-[#14213d]" : "border-transparent text-zinc-500"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
