"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SECTORS, STAGES, contactName, type Stage } from "@/lib/domain";
import { ContactFields } from "./ContactFields";
import { DealFields } from "./DealFields";
import { SubmitButton } from "./SubmitButton";

type Refs = Parameters<typeof DealFields>[0]["refs"] & { countries: { code: string; name: string }[] };
export type KnownClient = {
  id: string;
  name: string;
  country_code: string;
  kind: string | null;
  sector: string | null;
  headcount: number | null;
  primary_contact_id: string | null;
  deals: number;
};
export type KnownContact = { id: string; client_id: string; first_name: string | null; last_name: string; job_title: string | null };
type State = { error?: string; ok?: string };
type Mode = "search" | "existing" | "new";

/** Minuscules sans accents ni ponctuation, pour comparer « Société Générale » et « societe generale ». */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const MAX_RESULTS = 8;

/**
 * Création d'une affaire, à n'importe quelle étape. L'affaire est rattachée à une entreprise existante
 * (recherche) ou à une entreprise créée dans le même formulaire. « À contacter » exige secteur, commentaire et un contact.
 */
export function NewDealForm({
  action,
  refs,
  clients,
  contacts,
  defaultClientId,
  defaultCountry,
  defaultRep,
  defaultSdr,
  defaultStage,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  refs: Refs;
  clients: KnownClient[];
  contacts: KnownContact[];
  defaultClientId?: string;
  defaultCountry?: string | null;
  defaultRep?: number | null;
  defaultSdr?: number | null;
  defaultStage: Stage;
}) {
  const [state, formAction] = useActionState(action, {});
  const [stage, setStage] = useState<Stage>(defaultStage);
  const initial = clients.find((c) => c.id === defaultClientId) ?? null;
  const [mode, setMode] = useState<Mode>(initial ? "existing" : "search");
  const [client, setClient] = useState<KnownClient | null>(initial);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState(defaultCountry ?? "");
  const [contactChoice, setContactChoice] = useState<string>("nouveau");
  const searchRef = useRef<HTMLInputElement>(null);

  const prospect = stage === "a_contacter";
  const help = STAGES.find((s) => s.value === stage)?.help;
  const countryName = (code: string) => refs.countries.find((c) => c.code === code)?.name ?? code;
  const country = mode === "existing" ? client?.country_code ?? "" : mode === "new" ? newCountry : "";

  const q = norm(query);
  const matches = q
    ? clients
        .map((c) => ({ c, n: norm(c.name) }))
        .filter(({ n }) => n.includes(q))
        // D'abord les noms qui commencent par la saisie, puis ceux du pays de l'utilisateur.
        .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || Number(b.c.country_code === defaultCountry) - Number(a.c.country_code === defaultCountry))
        .map(({ c }) => c)
    : [];
  const exact = matches.some((c) => norm(c.name) === q);

  // En mode création, signale une entreprise qui porte déjà ce nom (dans n'importe quel pays).
  const twins = mode === "new" && norm(newName) ? clients.filter((c) => norm(c.name) === norm(newName)) : [];
  const twinSameCountry = twins.find((c) => c.country_code === newCountry);

  const clientContacts = client && mode === "existing" ? contacts.filter((c) => c.client_id === client.id) : [];

  function choose(c: KnownClient) {
    const own = contacts.filter((x) => x.client_id === c.id);
    setClient(c);
    setMode("existing");
    setContactChoice(own.find((x) => x.id === c.primary_contact_id)?.id ?? own[0]?.id ?? "nouveau");
  }
  function createNew(name: string) {
    setNewName(name);
    setClient(null);
    setMode("new");
    setContactChoice("nouveau");
  }
  function backToSearch() {
    setClient(null);
    setMode("search");
    setContactChoice("nouveau");
  }

  // Tant qu'aucune entreprise n'est choisie ni créée, le formulaire ne peut pas être envoyé.
  useEffect(() => {
    searchRef.current?.setCustomValidity(mode === "search" ? "Choisissez une entreprise dans la liste, ou créez-la." : "");
  }, [mode, query]);

  // « Aucun contact » n'est pas permis à l'étape « À contacter ».
  const choice = prospect && contactChoice === "" ? "nouveau" : contactChoice;
  const newContact = choice === "nouveau";

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Entreprise *</h2>
          {mode === "search" && (
            <button type="button" onClick={() => createNew(query.trim())} className="text-sm font-semibold text-brand-blue hover:underline">
              + Nouvelle entreprise
            </button>
          )}
          {mode !== "search" && (
            <button type="button" onClick={backToSearch} className="text-sm text-zinc-600 hover:underline">
              {mode === "existing" ? "Changer d'entreprise" : "← Choisir une entreprise existante"}
            </button>
          )}
        </div>

        {mode === "search" && (
          <div className="space-y-2">
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-600">Rechercher une entreprise existante</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input"
                placeholder="Tapez le nom de l'entreprise ou de la famille…"
                autoComplete="off"
                enterKeyHint="search"
                onKeyDown={(e) => {
                  // Entrée choisit le premier résultat au lieu d'envoyer le formulaire.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (matches[0]) choose(matches[0]);
                    else if (query.trim()) createNew(query.trim());
                  }
                }}
              />
            </label>
            {q && (
              <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
                {matches.slice(0, MAX_RESULTS).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => choose(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 active:bg-zinc-100">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {countryName(c.country_code)}
                          {c.sector ? ` · ${c.sector}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {c.deals} affaire{c.deals > 1 ? "s" : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {matches.length > MAX_RESULTS && (
                  <li className="px-3 py-2 text-xs text-zinc-500">
                    {matches.length - MAX_RESULTS} autre{matches.length - MAX_RESULTS > 1 ? "s" : ""} : précisez le nom.
                  </li>
                )}
                {!exact && (
                  <li>
                    <button type="button" onClick={() => createNew(query.trim())} className="w-full px-3 py-2.5 text-left text-sm font-semibold text-brand-blue hover:bg-blue-50/50">
                      + Créer l&apos;entreprise « {query.trim()} »
                    </button>
                  </li>
                )}
              </ul>
            )}
            {!q && <p className="text-xs text-zinc-500">Choisissez l&apos;entreprise dans la liste. Si elle n&apos;existe pas encore, vous pourrez la créer ici.</p>}
          </div>
        )}

        {mode === "existing" && client && (
          <>
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="country_code" value={client.country_code} />
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="font-semibold">{client.name}</p>
              <p className="text-xs text-zinc-600">
                {countryName(client.country_code)}
                {client.sector ? ` · ${client.sector}` : ""}
                {client.headcount ? ` · ${client.headcount} salariés` : ""}
                {` · ${client.deals} affaire${client.deals > 1 ? "s" : ""} déjà dans Cerise`}
              </p>
            </div>
            {(!client.sector || client.headcount === null) && (
              <div className="grid gap-3 md:grid-cols-3">
                {!client.sector && <SectorField required={prospect} />}
                {client.headcount === null && <HeadcountField />}
              </div>
            )}
          </>
        )}

        {mode === "new" && (
          <div className="space-y-2">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600">Nom de la nouvelle entreprise *</span>
                <input
                  name="client_name"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input"
                  placeholder="Entreprise ou famille"
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600">Pays *</span>
                <select name="country_code" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} required className="input">
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
              <SectorField required={prospect} />
              <HeadcountField />
            </div>
            {twins.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-amber-900">
                  {twinSameCountry ? "Cette entreprise existe déjà dans ce pays :" : "Une entreprise porte déjà ce nom :"}
                </p>
                <ul className="mt-1 space-y-1">
                  {twins.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => choose(c)} className="font-semibold text-brand-blue hover:underline">
                        Utiliser {c.name} ({countryName(c.country_code)})
                      </button>
                    </li>
                  ))}
                </ul>
                {twinSameCountry && <p className="mt-1 text-xs text-amber-900">Si vous créez quand même, l&apos;affaire sera rattachée à l&apos;entreprise existante.</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Contact{prospect ? " *" : " (facultatif)"}</h2>
        {clientContacts.length > 0 && (
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-600">Contact de {client?.name}</span>
            <select name="contact_id" value={choice} onChange={(e) => setContactChoice(e.target.value)} className="input">
              {clientContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactName(c)}
                  {c.job_title ? ` · ${c.job_title}` : ""}
                  {c.id === client?.primary_contact_id ? " (principal)" : ""}
                </option>
              ))}
              <option value="nouveau">+ Nouveau contact…</option>
              {!prospect && <option value="">Aucun pour l&apos;instant</option>}
            </select>
          </label>
        )}
        {newContact && (
          <div className={clientContacts.length > 0 ? "rounded-lg border border-dashed border-zinc-300 p-3" : ""}>
            {clientContacts.length > 0 && <p className="mb-2 text-xs text-zinc-500">Ce contact sera ajouté à l&apos;entreprise et rattaché à l&apos;affaire.</p>}
            <ContactFields prefix="contact_" required={prospect} />
          </div>
        )}
        {!prospect && newContact && clientContacts.length === 0 && (
          <p className="text-xs text-zinc-500">Laissez vide pour ajouter les contacts plus tard depuis la fiche de l&apos;affaire.</p>
        )}
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

function SectorField({ required }: { required: boolean }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-zinc-600">Secteur{required && " *"}</span>
      <input name="sector" list="sectors" required={required} className="input" placeholder="Choisir ou saisir" autoComplete="off" />
      <datalist id="sectors">
        {SECTORS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}

function HeadcountField() {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-zinc-600">Effectif</span>
      <input name="headcount" type="number" min={0} className="input" placeholder="Nombre de salariés" />
    </label>
  );
}
