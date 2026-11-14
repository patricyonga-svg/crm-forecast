"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentReport, REPORT_GROUPS } from "@/lib/report-menu";

/**
 * Menu « Rapports » de la barre du haut : une entrée par famille de rapports, avec un sous-menu
 * qui s'ouvre au survol ou au clic. Une famille d'un seul rapport (Vue d'ensemble) y mène directement.
 */
export function ReportsMenu() {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const current = currentReport(pathname);

  useEffect(() => {
    setOpen(false);
    setGroup(null);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const shown = group ?? current?.group.label ?? null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 hover:text-white" aria-expanded={open}>
        Rapports
        <span aria-hidden className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 flex overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm font-normal text-zinc-900 shadow-lg">
          <ul className="min-w-52 py-1">
            {REPORT_GROUPS.map((g) => {
              const single = g.reports.length === 1;
              const active = current?.group.label === g.label;
              const cls = `flex w-full items-center justify-between gap-6 whitespace-nowrap px-4 py-2 text-left ${shown === g.label && !single ? "bg-zinc-100" : "hover:bg-zinc-50"} ${active ? "font-semibold text-brand-blue" : ""}`;
              return (
                <li key={g.label} onMouseEnter={() => setGroup(single ? null : g.label)}>
                  {single ? (
                    <Link href={g.reports[0].href} className={cls}>
                      {g.label}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => setGroup(g.label)} className={cls} aria-expanded={shown === g.label}>
                      {g.label}
                      <span aria-hidden className="text-zinc-400">
                        ›
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {REPORT_GROUPS.filter((g) => g.label === shown && g.reports.length > 1).map((g) => (
            <div key={g.label} className="min-w-52 border-l border-zinc-100 bg-zinc-50/60 py-1">
              {g.question && <div className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">{g.question}</div>}
              {g.reports.map((r) => (
                <Link key={r.href} href={r.href} className={`block whitespace-nowrap px-4 py-2 hover:bg-white ${pathname === r.href ? "font-semibold text-brand-blue" : ""}`}>
                  {r.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
