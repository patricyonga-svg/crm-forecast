"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/reports";

/** Pastille aux initiales de l'utilisateur ; le clic ouvre son nom et la déconnexion. */
export function UserMenu({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Compte de ${name}`}
        title={name}
        className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-xs font-bold text-white hover:bg-white/25"
      >
        {initials(name)}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-52 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-sm text-zinc-900 shadow-lg">
          <div className="border-b border-zinc-100 px-4 py-2 font-semibold">{name}</div>
          <form action={signOut}>
            <button className="block w-full px-4 py-2 text-left hover:bg-zinc-50">Déconnexion</button>
          </form>
        </div>
      )}
    </div>
  );
}
