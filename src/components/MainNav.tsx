"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NavDropdown } from "./NavDropdown";

type Item = { href: string; label: string; badge?: number };

/** Liens principaux de la barre du haut ; la page en cours est surlignée. */
export function MainNav({ settings, overdue }: { settings: { href: string; label: string }[]; overdue: number }) {
  const pathname = usePathname();
  const vue = useSearchParams().get("vue");
  const items: Item[] = [
    { href: "/affaires", label: "Affaires" },
    { href: "/affaires?vue=relances", label: "Actions à faire", badge: overdue },
    { href: "/rapports", label: "Rapports" },
  ];
  const isActive = (href: string) => {
    if (href === "/affaires?vue=relances") return pathname === "/affaires" && vue === "relances";
    if (href === "/affaires") return pathname.startsWith("/affaires") && vue !== "relances";
    return pathname.startsWith(href);
  };
  const settingsActive = settings.some((s) => pathname.startsWith(s.href));

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-white/75">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(i.href) ? "page" : undefined}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors hover:text-white ${isActive(i.href) ? "bg-white/15 font-semibold text-white" : "hover:bg-white/5"}`}
        >
          {i.label}
          {!!i.badge && (
            <span className="rounded-full bg-brand-orange px-1.5 text-[11px] font-bold leading-5 text-white" title={`${i.badge} actions en retard ou du jour`}>
              {i.badge}
            </span>
          )}
        </Link>
      ))}
      {settings.length > 0 && (
        <div className={`rounded-md px-2.5 py-1.5 ${settingsActive ? "bg-white/15 font-semibold text-white" : "hover:bg-white/5"}`}>
          <NavDropdown label="Paramètres" items={settings} />
        </div>
      )}
    </nav>
  );
}
