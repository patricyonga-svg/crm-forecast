import { getReferences, getSession } from "@/lib/session";
import type { SdrAppointment, SdrDeal, SdrObjective } from "@/lib/sdr";

type Refs = Awaited<ReturnType<typeof getReferences>>;
type RepRef = Refs["reps"][number];

/** SDR à afficher : ceux qui ont le rôle SDR, plus ceux qui ont des objectifs ou des leads sur la période (ancien SDR par exemple). */
export function sdrReps(reps: RepRef[], extra: Iterable<number>) {
  const ids = new Set(extra);
  return reps.filter((r) => (r.is_sdr && r.active !== false) || ids.has(r.id));
}

/** Regroupe des commerciaux par pays (ordre des pays), en ignorant les pays vides. */
export function byCountry<T extends { country_code: string | null }>(countries: Refs["countries"], items: T[]) {
  return countries.map((c) => ({ code: c.code, name: c.name, items: items.filter((i) => i.country_code === c.code) })).filter((g) => g.items.length > 0);
}

export async function loadSdrLeads(from: string, to: string) {
  const { supabase, profile } = await getSession();
  const refs = await getReferences(supabase);
  const [{ data: deals, error }, { data: objectives }] = await Promise.all([
    supabase
      .from("deals")
      // Nombre de contacts de l'entreprise : un lead sans contact (donc sans décideur) n'est pas compté comme qualifié.
      .select("sdr_id, country_code, created_at, qualified_at, clients(contacts!contacts_client_id_fkey(count))")
      .not("sdr_id", "is", null)
      .or(`created_at.gte.${from},qualified_at.gte.${from}`)
      .returns<(Omit<SdrDeal, "has_contact"> & { clients: { contacts: { count: number }[] } | null })[]>(),
    supabase.from("sdr_objectives").select("sales_rep_id, month, new_leads, qualified_leads").gte("month", from).lte("month", to).returns<SdrObjective[]>(),
  ]);
  // Une requête en erreur ne doit pas afficher des réalisations à 0 sans prévenir.
  if (error) throw new Error(`Chargement des leads SDR impossible : ${error.message}`);
  const rows: SdrDeal[] = (deals ?? []).map(({ clients, ...d }) => ({ ...d, has_contact: clients ? (clients.contacts?.[0]?.count ?? 0) > 0 : undefined }));
  return { profile, refs, deals: rows, objectives: objectives ?? [] };
}

export async function loadAppointments(from: string) {
  const { supabase } = await getSession();
  const refs = await getReferences(supabase);
  const { data } = await supabase
    .from("appointments")
    .select("sales_rep_id, booked_by, created_at, starts_at, done_at, reported_at")
    .or(`created_at.gte.${from},starts_at.gte.${from}`)
    .limit(10000)
    .returns<SdrAppointment[]>();
  return { refs, appointments: data ?? [] };
}
