import { getReferences, getSession } from "@/lib/session";
import { isStage } from "@/lib/domain";
import { NewDealForm, type KnownClient, type KnownContact } from "@/components/NewDealForm";
import { createDeal } from "../actions";

type ClientRow = Omit<KnownClient, "deals"> & { deals: { count: number }[] | null };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ etape?: string; entreprise?: string }> }) {
  const { etape, entreprise } = await searchParams;
  const { supabase, profile } = await getSession();
  const [refs, { data: clients }, { data: contacts }] = await Promise.all([
    getReferences(supabase),
    supabase
      .from("clients")
      .select("id, name, country_code, kind, sector, headcount, primary_contact_id, deals(count)")
      .order("name")
      .limit(5000)
      .returns<ClientRow[]>(),
    supabase.from("contacts").select("id, client_id, first_name, last_name, job_title").order("last_name").limit(10000).returns<KnownContact[]>(),
  ]);
  const myRep = refs.reps.find((r) => r.profile_id === profile?.id);
  const known: KnownClient[] = (clients ?? []).map(({ deals, ...c }) => ({ ...c, deals: deals?.[0]?.count ?? 0 }));

  return (
    <NewDealForm
      action={createDeal}
      refs={refs}
      clients={known}
      contacts={contacts ?? []}
      defaultClientId={entreprise}
      defaultCountry={profile?.country_code}
      // Un SDR qui crée une affaire en est le SDR ; le porteur (AE) sera choisi au rendez-vous.
      defaultRep={myRep && !myRep.is_sdr ? myRep.id : null}
      defaultSdr={myRep?.is_sdr ? myRep.id : null}
      defaultStage={isStage(etape) ? etape : "a_contacter"}
    />
  );
}
