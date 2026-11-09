"use client";

import { useActionState, useState } from "react";
import { SECTORS, STAGES, type Stage } from "@/lib/domain";
import { ContactFields } from "./ContactFields";
import { DealFields } from "./DealFields";
import { SubmitButton } from "./SubmitButton";

type Refs = Parameters<typeof DealFields>[0]["refs"] & { countries: { code: string; name: string }[] };
type KnownClient = { name: string; country_code: string; sector: string | null; headcount: number | null };
type State = { error?: string; ok?: string };

/** Création d'une affaire, à n'importe quelle étape. « À contacter » exige secteur, commentaire et un contact. */
export function NewDealForm({
  action,
  refs,
  clients,
  defaultCountry,
  defaultRep,
  defaultSdr,
  defaultStage,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  refs: Refs;
  clients: KnownClient[];
  defaultCountry?: string | null;
  defaultRep?: number | null;
  defaultSdr?: number | null;
  defaultStage: Stage;
}) {
  const [state, formAction] = useActionState(action, {});
  const [stage, setStage] = useState<Stage>(defaultStage);
  const [country, setCountry] = useState(defaultCountry ?? "");
  const [clientName, setClientName] = useState("");
  const prospect = stage === "a_contacter";
  const known = clients.find((c) => c.country_code === country && c.name.toLowerCase() === clientName.trim().toLowerCase());
  const help = STAGES.find((s) => s.value === stage)?.help;

  return (
    <form action={formAction} className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Nouvelle affaire</h1>

      <div className="card space-y-2">
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-600">Étape du cycle de vente</span>
          <select name="stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="input">
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-zinc-500">{help}</p>
        {stage === "prise_rdv" && <p className="text-xs text-brand-blue">Après la création, le formulaire de rendez-vous s&apos;ouvrira.</p>}
        {stage === "cr_rdv" && <p className="text-xs text-brand-blue">Après la création, le formulaire de compte rendu s&apos;ouvrira.</p>}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Entreprise</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Nom de l&apos;entreprise *</span>
            <input
              name="client_name"
              required
              list="known-clients"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="input"
              placeholder="Entreprise ou famille"
              autoComplete="off"
            />
            <datalist id="known-clients">
              {clients
                .filter((c) => !country || c.country_code === country)
                .map((c) => (
                  <option key={`${c.country_code}:${c.name}`} value={c.name} />
                ))}
            </datalist>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Pays *</span>
            <select name="country_code" value={country} onChange={(e) => setCountry(e.target.value)} required className="input">
              <option value="">—</option>
              {refs.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Type de client</span>
            <select name="client_kind" defaultValue="entreprise" className="input">
              <option value="entreprise">Entreprise</option>
              <option value="famille">Famille</option>
              <option value="particulier">Particulier</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Secteur{prospect && !known?.sector && " *"}</span>
            <input
              name="sector"
              list="sectors"
              required={prospect && !known?.sector}
              className="input"
              placeholder={known?.sector ?? "Choisir ou saisir"}
              autoComplete="off"
            />
            <datalist id="sectors">
              {SECTORS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Effectif</span>
            <input name="headcount" type="number" min={0} className="input" placeholder={known?.headcount ? String(known.headcount) : "Nombre de salariés"} />
          </label>
        </div>
        {known && <p className="text-xs text-emerald-700">Entreprise déjà connue dans Cerise : l&apos;affaire lui sera rattachée, les champs vides seront complétés.</p>}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Contact{prospect ? " *" : " (facultatif)"}</h2>
        <ContactFields prefix="contact_" required={prospect} />
        {!prospect && <p className="text-xs text-zinc-500">Laissez vide pour ajouter les contacts plus tard depuis la fiche de l&apos;affaire.</p>}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Affaire</h2>
        <DealFields refs={refs} country={country || undefined} deal={{ sales_rep_id: defaultRep ?? null, sdr_id: defaultSdr ?? null }} showStage={false} commentRequired={prospect} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Créer l&apos;affaire</SubmitButton>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
