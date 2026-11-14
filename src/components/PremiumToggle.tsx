"use client";

import { useState, useTransition } from "react";

/**
 * Interrupteur « Client Premium » de la fiche affaire (administrateurs et managers).
 * La marque est posée sur le client : toutes ses affaires, passées et futures, en héritent.
 */
export function PremiumToggle({
  premium,
  since,
  dealCount,
  action,
}: {
  premium: boolean;
  since: string | null;
  dealCount: number;
  action: (premium: boolean) => Promise<{ ok?: string; error?: string }>;
}) {
  const [on, setOn] = useState(premium);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setMessage(null);
    startTransition(async () => {
      const result = await action(next);
      if (result.error) {
        setOn(!next);
        setMessage({ text: result.error, error: true });
      } else setMessage({ text: result.ok ?? "Enregistré." });
    });
  }

  return (
    <div className={`rounded-lg border p-3 ${on ? "border-amber-400 bg-amber-50/60" : "border-zinc-200"}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Client Premium"
          disabled={pending}
          onClick={toggle}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-amber-500" : "bg-zinc-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <div className="text-sm">
          <div className="font-semibold">★ Client Premium</div>
          <p className="text-zinc-600">
            {on
              ? `${dealCount > 1 ? `Ses ${dealCount} affaires apparaissent` : "Ses affaires apparaissent"} dans l'espace Premium${since && premium ? `, depuis le ${new Date(since).toLocaleDateString("fr-FR")}` : ""}.`
              : "Activez pour suivre toutes les affaires de ce client dans l'espace Premium."}
          </p>
          {message && <p className={`mt-1 font-medium ${message.error ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
        </div>
      </div>
    </div>
  );
}
