"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 20 * 1024 * 1024;

/** Nom de fichier sans accents ni caractères spéciaux, pour le chemin de stockage. */
const safeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(-80) || "devis";

/**
 * Envoi du devis : le fichier part directement du navigateur vers l'espace privé « devis » de Supabase,
 * puis son chemin est transmis au formulaire dans des champs cachés (quote_file_path, quote_file_name).
 */
export function QuoteUpload({
  dealId,
  current,
  required = false,
  label = "Devis",
  onUploaded,
}: {
  dealId?: string;
  current?: { path: string | null; name: string | null };
  required?: boolean;
  label?: string;
  onUploaded?: (file: { path: string; name: string }) => void;
}) {
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({});
  const hasCurrent = !!current?.path;

  async function upload(f: File) {
    if (f.size > MAX_BYTES) return setStatus({ error: "Fichier trop lourd (20 Mo maximum)." });
    setStatus({ busy: true });
    const path = `${dealId ?? "nouvelle"}/${Date.now()}-${safeName(f.name)}`;
    const { error } = await createClient().storage.from("devis").upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (error) return setStatus({ error: `Envoi impossible : ${error.message}` });
    const uploaded = { path, name: f.name };
    setFile(uploaded);
    setStatus({});
    onUploaded?.(uploaded);
  }

  return (
    <div className="space-y-1 text-sm">
      <span className="text-zinc-600">
        {label}
        {required && !hasCurrent && " *"}
      </span>
      {hasCurrent && !file && (
        <div className="text-sm">
          {dealId ? (
            <a href={`/affaires/${dealId}/devis`} target="_blank" rel="noreferrer" className="font-semibold text-brand-blue hover:underline">
              📎 {current?.name ?? "Devis joint"}
            </a>
          ) : (
            <span>📎 {current?.name ?? "Devis joint"}</span>
          )}
        </div>
      )}
      <input
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        // Le fichier lui-même n'est pas envoyé avec le formulaire : seul son chemin l'est.
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold hover:file:bg-zinc-50"
        aria-label={hasCurrent ? "Remplacer le devis" : "Joindre le devis"}
      />
      {file && <input type="hidden" name="quote_file_path" value={file.path} />}
      {file && <input type="hidden" name="quote_file_name" value={file.name} />}
      {status.busy && <p className="text-xs text-zinc-500">Envoi du fichier…</p>}
      {file && !status.busy && <p className="text-xs text-emerald-700">« {file.name} » prêt : il sera rattaché à l&apos;affaire à l&apos;enregistrement.</p>}
      {status.error && <p className="text-xs text-red-700">{status.error}</p>}
      {!hasCurrent && !file && !status.busy && (
        <p className="text-xs text-zinc-500">Obligatoire pour passer en Forecast, Won Pending ou Won (PDF, Word, Excel ou image, 20 Mo maximum).</p>
      )}
    </div>
  );
}
