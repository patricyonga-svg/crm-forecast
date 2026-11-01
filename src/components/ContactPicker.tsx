"use client";

import { useState } from "react";
import { contactName, type Contact } from "@/lib/domain";
import { ContactFields } from "./ContactFields";

/** Choix d'un contact de l'affaire, ou création d'un nouveau contact (rattaché ensuite à l'affaire). */
export function ContactPicker({ name, prefix, contacts, label, defaultValue }: { name: string; prefix: string; contacts: Contact[]; label: string; defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue ?? (contacts[0]?.id ?? "nouveau"));
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="text-zinc-600">{label}</span>
        <select name={name} value={value} onChange={(e) => setValue(e.target.value)} className="input">
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {contactName(c)}
              {c.job_title ? ` · ${c.job_title}` : ""}
            </option>
          ))}
          <option value="nouveau">+ Nouveau contact…</option>
        </select>
      </label>
      {value === "nouveau" && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-3">
          <p className="mb-2 text-xs text-zinc-500">Ce contact sera ajouté à l&apos;entreprise et rattaché à l&apos;affaire.</p>
          <ContactFields prefix={prefix} />
        </div>
      )}
    </div>
  );
}
