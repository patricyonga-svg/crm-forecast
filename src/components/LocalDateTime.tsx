"use client";

import { useState } from "react";

/** Date et heure saisies dans le fuseau de l'utilisateur, envoyées au serveur en heure universelle. */
export function LocalDateTime({ name, required }: { name: string; required?: boolean }) {
  const [iso, setIso] = useState("");
  return (
    <>
      <input
        type="datetime-local"
        required={required}
        className="input"
        onChange={(e) => setIso(e.target.value ? new Date(e.target.value).toISOString() : "")}
      />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
