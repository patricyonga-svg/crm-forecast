"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/domain";

export async function saveUser(form: FormData) {
  const supabase = await createClient();
  const id = String(form.get("id"));
  const role = String(form.get("role") ?? "");
  const country = String(form.get("country_code") ?? "") || null;
  const repId = Number(form.get("sales_rep_id")) || null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Un administrateur ne peut pas se retirer lui-même ses droits (le champ rôle est désactivé pour lui).
  const isMe = user?.id === id;
  if (!isMe && !ROLES.some((r) => r.value === role)) throw new Error("Rôle invalide");
  const update = isMe ? { country_code: country } : { role, country_code: country };
  const { data: profile, error } = await supabase.from("profiles").update(update).eq("id", id).select("email").single();
  if (error) throw new Error(error.message);

  // Un profil est rattaché à au plus un nom de commercial du fichier.
  const { error: unlinkError } = await supabase.from("sales_reps").update({ profile_id: null, email: null }).eq("profile_id", id);
  if (unlinkError) throw new Error(unlinkError.message);
  if (repId) {
    const { error: linkError } = await supabase.from("sales_reps").update({ profile_id: id, email: profile.email }).eq("id", repId);
    if (linkError) throw new Error(linkError.message);
  }
  revalidatePath("/utilisateurs");
}
