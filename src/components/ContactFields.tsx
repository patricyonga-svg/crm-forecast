import type { Contact } from "@/lib/domain";

/** Champs d'un contact : Nom*, Prénom, Fonction, Décideur, Email, Téléphone, Commentaire. */
export function ContactFields({ prefix = "", contact, required = true }: { prefix?: string; contact?: Partial<Contact>; required?: boolean }) {
  const decision = contact?.is_decision_maker === true ? "oui" : contact?.is_decision_maker === false ? "non" : "";
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Nom{required && " *"}</span>
        <input name={`${prefix}last_name`} defaultValue={contact?.last_name ?? ""} required={required} className="input" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Prénom</span>
        <input name={`${prefix}first_name`} defaultValue={contact?.first_name ?? ""} className="input" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Fonction</span>
        <input name={`${prefix}job_title`} defaultValue={contact?.job_title ?? ""} className="input" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Décideur ?</span>
        <select name={`${prefix}is_decision_maker`} defaultValue={decision} className="input">
          <option value="">Ne sait pas</option>
          <option value="oui">Oui</option>
          <option value="non">Non</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Email</span>
        <input name={`${prefix}email`} type="email" defaultValue={contact?.email ?? ""} className="input" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Téléphone</span>
        <input name={`${prefix}phone`} type="tel" defaultValue={contact?.phone ?? ""} className="input" />
      </label>
      <label className="space-y-1 text-sm md:col-span-3">
        <span className="text-zinc-600">Commentaire</span>
        <input name={`${prefix}comment`} defaultValue={contact?.comment ?? ""} className="input" />
      </label>
    </div>
  );
}
