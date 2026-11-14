"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseObjective } from "@/lib/reports";
import { parseCount } from "@/lib/sdr";

/** Réponse affichée sous le bouton du formulaire (voir ActionForm). */
type State = { error?: string; ok?: string };

export async function saveObjectives(_prev: State, form: FormData): Promise<State> {
  const supabase = await createClient();
  const rows = [...form.keys()]
    .filter((k) => k.startsWith("obj_"))
    .map((k) => {
      const [, rep, month] = k.split("_");
      return { sales_rep_id: Number(rep), month, amount: parseObjective(String(form.get(k) ?? "")) };
    });
  if (rows.length) {
    const { error } = await supabase.from("rep_objectives").upsert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath("/parametres/objectifs");
  revalidatePath("/rapports", "layout");
  return { ok: "Objectifs enregistrés ✓" };
}

export async function addRep(_prev: State, form: FormData): Promise<State> {
  const supabase = await createClient();
  const name = String(form.get("display_name") ?? "").trim();
  if (!name) return { error: "Nom manquant" };
  const { error } = await supabase.from("sales_reps").insert({ display_name: name, country_code: String(form.get("country_code")) });
  if (error) return { error: error.code === "23505" ? `« ${name} » existe déjà` : error.message };
  revalidatePath("/parametres/objectifs");
  return { ok: `« ${name} » ajouté ✓` };
}

export async function setRepActive(_prev: State, form: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_reps")
    .update({ active: form.get("active") === "true" })
    .eq("id", Number(form.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/parametres/objectifs");
  revalidatePath("/rapports", "layout");
  return { ok: "C'est fait ✓" };
}

/** Corrige le nom d'un commercial (affiché partout : affaires, objectifs, rapports, export). */
export async function renameRep(_prev: State, form: FormData): Promise<State> {
  const supabase = await createClient();
  const name = String(form.get("display_name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "Nom manquant" };
  const { data, error } = await supabase.from("sales_reps").update({ display_name: name }).eq("id", Number(form.get("id"))).select("id");
  if (error) return { error: error.code === "23505" ? `« ${name} » existe déjà` : error.message };
  if (!data?.length) return { error: "Modification refusée (réservée aux administrateurs)" };
  revalidatePath("/", "layout");
  return { ok: "Nom corrigé ✓" };
}

export async function savePipelineSettings(_prev: State, form: FormData): Promise<State> {
  const supabase = await createClient();
  const parse = (k: string) => Number(String(form.get(k) ?? "").replace(",", "."));
  const forecast_multiple = parse("forecast_multiple");
  const pipe_multiple = parse("pipe_multiple");
  if (!(forecast_multiple > 0 && pipe_multiple > 0)) return { error: "Les multiples doivent être supérieurs à 0" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("pipeline_settings")
    .update({ forecast_multiple, pipe_multiple, updated_at: new Date().toISOString(), updated_by: user?.id })
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/parametres/pipeline");
  revalidatePath("/rapports", "layout");
  return { ok: "Multiples enregistrés ✓" };
}

/** Objectifs de prospection des SDR : champs « sdr_<commercial>_<mois>_new » et « sdr_<commercial>_<mois>_qual ». */
export async function saveSdrObjectives(_prev: State, form: FormData): Promise<State> {
  const supabase = await createClient();
  const rows = new Map<string, { sales_rep_id: number; month: string; new_leads: number; qualified_leads: number }>();
  for (const k of form.keys()) {
    const m = /^sdr_(\d+)_(\d{4}-\d{2}-01)_(new|qual)$/.exec(k);
    if (!m) continue;
    const key = `${m[1]}_${m[2]}`;
    const row = rows.get(key) ?? { sales_rep_id: Number(m[1]), month: m[2], new_leads: 0, qualified_leads: 0 };
    row[m[3] === "new" ? "new_leads" : "qualified_leads"] = parseCount(String(form.get(k) ?? ""));
    rows.set(key, row);
  }
  if (rows.size) {
    const { error } = await supabase.from("sdr_objectives").upsert([...rows.values()]);
    if (error) return { error: error.message };
  }
  revalidatePath("/parametres/objectifs-sdr");
  revalidatePath("/rapports", "layout");
  return { ok: "Objectifs SDR enregistrés ✓" };
}
