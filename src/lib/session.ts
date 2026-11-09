import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/domain";

/** Client Supabase et profil de l'utilisateur connecté. */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  return { supabase, user, profile };
}

/** Référentiels utilisés dans les filtres et formulaires. */
export async function getReferences(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [countries, lines, reps, profiles] = await Promise.all([
    supabase.from("countries").select("code, name, currency").order("name"),
    supabase.from("business_lines").select("id, name").eq("active", true).order("name"),
    supabase.from("sales_reps").select("id, display_name, country_code, profile_id, active").order("display_name"),
    supabase.from("profiles").select("id, role"),
  ]);
  // Un commercial est SDR quand le compte rattaché à son nom a le rôle « Commercial - SDR ».
  const sdrProfiles = new Set((profiles.data ?? []).filter((p) => p.role === "sdr").map((p) => p.id as string));
  return {
    countries: countries.data ?? [],
    lines: lines.data ?? [],
    reps: (reps.data ?? []).map((r) => ({ ...r, is_sdr: !!r.profile_id && sdrProfiles.has(r.profile_id) })),
  };
}
