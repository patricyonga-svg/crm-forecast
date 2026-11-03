"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type FilterDef = { name: string; label: string; options: { value: string; label: string }[] };

/**
 * Filtres de la liste des affaires : recherche, « Mes affaires », puis une pastille par filtre actif
 * (retirée d'un clic) et un menu « + Filtre ». Chaque changement s'applique tout de suite via l'URL.
 */
export function FilterBar({ filters }: { filters: FilterDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState<string | null>(null); // null = fermé, "" = liste des filtres, sinon nom du filtre
  const [q, setQ] = useState(params.get("q") ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => {
    if (menu === null) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  function go(change: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString());
    change(p);
    const str = p.toString();
    startTransition(() => router.push(`${pathname}${str ? `?${str}` : ""}`, { scroll: false }));
  }
  const toggle = (name: string, value: string) =>
    go((p) => {
      const current = p.getAll(name);
      p.delete(name);
      for (const v of current.includes(value) ? current.filter((v) => v !== value) : [...current, value]) p.append(name, v);
    });

  const vue = params.get("vue");
  const active = filters.flatMap((f) =>
    params.getAll(f.name).map((v) => ({ name: f.name, value: v, label: f.options.find((o) => o.value === v)?.label ?? v })),
  );
  const current = filters.find((f) => f.name === menu);

  return (
    <div ref={ref} className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")));
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Rechercher un client…" aria-label="Rechercher un client" className="input w-56" />
      </form>
      {vue !== "relances" && (
        <button
          type="button"
          onClick={() => go((p) => (vue === "miennes" ? p.delete("vue") : p.set("vue", "miennes")))}
          className={`rounded-full border px-3 py-1 text-sm font-medium ${vue === "miennes" ? "border-brand-navy bg-brand-navy text-white" : "border-zinc-300 bg-white hover:border-zinc-400"}`}
        >
          Mes affaires
        </button>
      )}
      {active.map((a) => (
        <button
          key={`${a.name}:${a.value}`}
          type="button"
          onClick={() => toggle(a.name, a.value)}
          title="Retirer ce filtre"
          className="flex items-center gap-1.5 rounded-full border border-brand-navy bg-brand-navy py-1 pl-3 pr-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {a.label}
          <span aria-hidden className="text-white/70">
            ✕
          </span>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((m) => (m === null ? "" : null))}
          aria-expanded={menu !== null}
          className="rounded-full border border-dashed border-zinc-400 bg-white px-3 py-1 text-sm font-medium text-zinc-700 hover:border-zinc-500"
        >
          + Filtre
        </button>
        {menu !== null && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg">
            {current ? (
              <>
                <button type="button" onClick={() => setMenu("")} className="block w-full px-3 py-1.5 text-left text-xs text-brand-blue hover:bg-zinc-50">
                  ‹ {current.label}
                </button>
                {current.options.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 hover:bg-zinc-50">
                    <input type="checkbox" checked={params.getAll(current.name).includes(o.value)} onChange={() => toggle(current.name, o.value)} className="accent-brand-blue" />
                    {o.label}
                  </label>
                ))}
              </>
            ) : (
              filters.map((f) => {
                const n = params.getAll(f.name).length;
                return (
                  <button key={f.name} type="button" onClick={() => setMenu(f.name)} className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-zinc-50">
                    {f.label}
                    <span className="text-xs text-zinc-400">{n ? `${n} choisi${n > 1 ? "s" : ""}` : "›"}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      {(active.length > 0 || params.get("q")) && (
        <button
          type="button"
          onClick={() =>
            go((p) => {
              for (const f of filters) p.delete(f.name);
              p.delete("q");
            })
          }
          className="text-sm text-zinc-500 underline hover:text-zinc-800"
        >
          Effacer les filtres
        </button>
      )}
    </div>
  );
}
