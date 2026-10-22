import { SubmitButton } from "@/components/SubmitButton";
import { getReferences, getSession } from "@/lib/session";
import { DealFields } from "@/components/DealFields";
import { createDeal } from "../actions";

export default async function NewDealPage() {
  const { supabase, profile } = await getSession();
  const refs = await getReferences(supabase);
  const myRep = refs.reps.find((r) => r.profile_id === profile?.id);

  return (
    <form action={createDeal} className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Nouvelle affaire</h1>
      <div className="card grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm md:col-span-1">
          <span className="text-zinc-600">Client</span>
          <input name="client_name" required className="input" placeholder="Nom de l'entreprise ou de la famille" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-600">Pays</span>
          <select name="country_code" defaultValue={profile?.country_code ?? ""} required className="input">
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
      </div>
      <div className="card">
        <DealFields refs={refs} country={profile?.country_code ?? undefined} deal={{ sales_rep_id: myRep?.id ?? null }} />
      </div>
      <SubmitButton>Créer l&apos;affaire</SubmitButton>
    </form>
  );
}
