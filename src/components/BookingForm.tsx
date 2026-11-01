"use client";

import { bookAppointment } from "@/app/(app)/affaires/actions";
import type { Contact } from "@/lib/domain";
import { ActionForm } from "./ActionForm";
import { ContactPicker } from "./ContactPicker";
import { LocalDateTime } from "./LocalDateTime";

const DURATIONS: [number, string][] = [
  [30, "30 min"],
  [45, "45 min"],
  [60, "1 h"],
  [90, "1 h 30"],
  [120, "2 h"],
];

/** Formulaire de prise de rendez-vous pour un commercial (fiche affaire et pipe). */
export function BookingForm({
  dealId,
  contacts,
  reps,
  defaultRep,
  move = false,
  onSuccess,
}: {
  dealId: string;
  contacts: Contact[];
  reps: { id: number; display_name: string }[];
  defaultRep?: number | null;
  move?: boolean;
  onSuccess?: (message: string) => void;
}) {
  return (
    <ActionForm
      action={bookAppointment.bind(null, dealId)}
      className="space-y-3"
      submitLabel="Réserver le rendez-vous"
      pendingLabel="Réservation…"
      resetOnSuccess
      onSuccess={onSuccess}
    >
      {move && <input type="hidden" name="move" value="1" />}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-zinc-600">Commercial *</span>
          <select name="sales_rep_id" required defaultValue={defaultRep ?? ""} className="input">
            <option value="">—</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-600">Date et heure *</span>
          <LocalDateTime name="starts_at" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-600">Durée</span>
          <select name="duration_minutes" defaultValue="60" className="input">
            {DURATIONS.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-600">Lieu ou lien de visio</span>
          <input name="location" className="input" placeholder="Adresse, Google Meet…" />
        </label>
      </div>
      <ContactPicker name="contact_id" prefix="rdv_" contacts={contacts} label="Personne à rencontrer *" />
      <label className="block space-y-1 text-sm">
        <span className="text-zinc-600">Notes pour le commercial</span>
        <textarea name="notes" rows={2} className="input" />
      </label>
      <p className="text-xs text-zinc-500">Un email part vers le commercial et vers vous si vous n&apos;êtes pas le commercial.</p>
    </ActionForm>
  );
}
