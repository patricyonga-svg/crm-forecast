import { getReferences, getSession } from "@/lib/session";
import { isStage } from "@/lib/domain";
import { NewDealForm } from "@/components/NewDealForm";
import { createDeal } from "../actions";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const { etape } = await searchParams;
  const { supabase, profile } = await getSession();
  const [refs, { data: clients }] = await Promise.all([
    getReferences(supabase),
    supabase.from("clients").select("name, country_code, sector, headcount").order("name").limit(5000),
  ]);
  const myRep = refs.reps.find((r) => r.profile_id === profile?.id);

  return (
    <NewDealForm
      action={createDeal}
      refs={refs}
      clients={clients ?? []}
      defaultCountry={profile?.country_code}
      // Un SDR qui crée une affaire en est le SDR ; le porteur (AE) sera choisi au rendez-vous.
      defaultRep={myRep && !myRep.is_sdr ? myRep.id : null}
      defaultSdr={myRep?.is_sdr ? myRep.id : null}
      defaultStage={isStage(etape) ? etape : "a_contacter"}
    />
  );
}
