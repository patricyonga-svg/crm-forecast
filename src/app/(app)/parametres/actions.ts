"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseObjective } from "@/lib/reports";

export async function saveObjectives(form: FormData) {
  const supabase = await createClient();
  const rows = [...form.keys()]
    .filter((k) => k.startsWith("obj_"))
    .map((k) => {
      const [, rep, month] = k.split("_");
      return { sales_rep_id: Number(rep), month, amount: parseObjective(String(form.get(k) ?? "")) };
    });
  if (rows.length) {
    const { error } = await supabase.from("rep_objectives").upsert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/parametres/objectifs");
  revalidatePath("/rapports", "layout");
}

export async function addRep(form: FormData) {
  const supabase = await createClient();
  const name = String(form.get("display_name") ?? "").trim();
  if (!name) throw new Error("Nom manquant");
  const { error } = await supabase.from("sales_reps").insert({ display_name: name, country_code: String(form.get("country_code")) });
  if (error) throw new Error(error.code === "23505" ? `« ${name} » existe déjà` : error.message);
  revalidatePath("/parametres/objectifs");
}

export async function setRepActive(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_reps")
    .update({ active: form.get("active") === "true" })
    .eq("id", Number(form.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/parametres/objectifs");
}

export async function savePipelineSettings(form: FormData) {
  const supabase = await createClient();
  const parse = (k: string) => Number(String(form.get(k) ?? "").replace(",", "."));
  const forecast_multiple = parse("forecast_multiple");
  const pipe_multiple = parse("pipe_multiple");
  if (!(forecast_multiple > 0 && pipe_multiple > 0)) throw new Error("Les multiples doivent être supérieurs à 0");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("pipeline_settings")
    .update({ forecast_multiple, pipe_multiple, updated_at: new Date().toISOString(), updated_by: user?.id })
    .eq("id", true);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres/pipeline");
  revalidatePath("/rapports", "layout");
}
