"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Tab = { href: string; label: string; icon: React.ReactNode; active: boolean; badge?: number; primary?: boolean };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONS = {
  deals: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...stroke}>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </svg>
  ),
  actions: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden {...stroke} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  agenda: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...stroke}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...stroke}>
      <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6" />
    </svg>
  ),
};

/** Barre d'onglets du bas, affichée seulement sur téléphone : les écrans utiles en déplacement. */
export function MobileNav({ overdue }: { overdue: number }) {
  const pathname = usePathname();
  const vue = useSearchParams().get("vue");
  const tabs: Tab[] = [
    { href: "/affaires", label: "Affaires", icon: ICONS.deals, active: pathname.startsWith("/affaires") && vue !== "relances" },
    { href: "/affaires?vue=relances", label: "À faire", icon: ICONS.actions, active: pathname === "/affaires" && vue === "relances", badge: overdue },
    { href: "/ajouter", label: "Ajouter", icon: ICONS.add, active: pathname.startsWith("/ajouter"), primary: true },
    { href: "/agenda", label: "Agenda", icon: ICONS.agenda, active: pathname.startsWith("/agenda") },
    { href: "/rapports", label: "Synthèse", icon: ICONS.reports, active: pathname.startsWith("/rapports") },
  ];
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                t.active ? "text-brand-navy" : "text-zinc-500"
              }`}
            >
              {t.primary ? (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-orange text-white shadow-md">{t.icon}</span>
              ) : (
                <>
                  <span className={`grid h-8 w-12 place-items-center rounded-full ${t.active ? "bg-blue-50 text-brand-blue" : ""}`}>{t.icon}</span>
                  {t.label}
                </>
              )}
              {!!t.badge && (
                <span className="absolute left-1/2 top-1.5 ml-2 min-w-5 rounded-full bg-brand-orange px-1 text-center text-[10px] font-bold leading-5 text-white">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
              {t.primary && <span className="sr-only">{t.label}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
