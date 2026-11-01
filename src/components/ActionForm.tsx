"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "./SubmitButton";

type State = { error?: string; ok?: string };

/** Formulaire relié à une action serveur : affiche l'erreur ou la confirmation sous le bouton. */
export function ActionForm({
  action,
  children,
  submitLabel = "Enregistrer",
  pendingLabel,
  className = "space-y-3",
  buttonClassName,
  resetOnSuccess = false,
  id,
  onSuccess,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  children: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  resetOnSuccess?: boolean;
  id?: string;
  onSuccess?: (message: string) => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const callback = useRef(onSuccess);
  useEffect(() => {
    callback.current = onSuccess;
  });
  // Ne se déclenche qu'à chaque nouvelle réponse de l'action.
  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    callback.current?.(state.ok);
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={pendingLabel} className={buttonClassName}>
          {submitLabel}
        </SubmitButton>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
