"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Menu déroulant de la barre de navigation ; se ferme au clic extérieur et au changement de page. */
export function NavDropdown({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 hover:text-white" aria-expanded={open}>
        {label}
        <span aria-hidden className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-zinc-900 shadow-lg">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`block px-4 py-2 hover:bg-zinc-50 ${pathname === i.href ? "font-semibold text-brand-blue" : ""}`}>
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
