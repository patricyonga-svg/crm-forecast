"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Liste déroulante à cases à cocher pour un formulaire GET : chaque case cochée envoie `name=valeur`,
 * d'où un paramètre répété dans l'URL (?pays=SN&pays=CI). Aucune case cochée = pas de filtre.
 */
export function MultiSelect({
  name,
  allLabel,
  options,
  defaultValue,
}: {
  name: string;
  allLabel: string;
  options: { value: string; label: string }[];
  defaultValue: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const toggle = (value: string) => setSelected((s) => (s.includes(value) ? s.filter((v) => v !== value) : [...s, value]));
  const labels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const summary = labels.length === 0 ? allLabel : labels.length === 1 ? labels[0] : `${labels.length} sélectionnés`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="input flex items-center justify-between gap-2 text-left" aria-expanded={open}>
        <span className={`truncate ${labels.length ? "font-medium text-brand-blue" : ""}`}>{summary}</span>
        <span aria-hidden className={`text-[10px] text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {/* Toujours dans le DOM (même fermé) pour que les cases cochées partent avec le formulaire. */}
      <div className={`absolute left-0 top-full z-20 mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg ${open ? "" : "hidden"}`}>
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])} className="block w-full px-3 py-1.5 text-left text-xs text-brand-blue hover:bg-zinc-50">
            Tout désélectionner
          </button>
        )}
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm hover:bg-zinc-50">
            <input type="checkbox" name={name} value={o.value} checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-brand-blue" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
