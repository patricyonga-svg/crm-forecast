"use client";

import { useFormStatus } from "react-dom";

/** Bouton d'envoi désactivé pendant l'enregistrement, pour éviter les doublons en cas de clics répétés. */
export function SubmitButton({ children, pendingLabel = "Enregistrement…", className = "btn" }: { children: React.ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={`${className} disabled:cursor-wait`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
