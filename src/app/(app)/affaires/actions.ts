"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/domain";

function text(form: FormData, name: string): string | null {
  const v = String(form.get(name) ?? "").trim();
  return v === "" ? null : v;
}

function int(form: FormData, name: string): number | null {
  const v = text(form, name);
  if (v === null) return null;
  const n = Number(v.replace(/[\s  ]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function dealFields(form: FormData) {
  const stage = text(form, "stage");
  if (!STAGES.some((s) => s.value === stage)) throw new Error("Étape invalide");
  return {
    business_line_id: int(form, "business_line_id"),
    sales_rep_id: int(form, "sales_rep_id"),
    beneficiaries: int(form, "beneficiaries"),
    quote_amount: int(form, "quote_amount") ?? 0,
    stage,
    expected_close_date: text(form, "expected_close_date"),
    next_action: text(form, "next_action"),
    next_action_date: text(form, "next_action_date"),
  };
}

export async function createDeal(form: FormData) {
  const supabase = await createClient();
  const country = text(form, "country_code");
  const name = text(form, "client_name");
  if (!country || !name) throw new Error("Client et pays obligatoires");

  // Réutilise un client existant du même pays plutôt que de créer un doublon.
  const { data: existing } = await supabase.from("clients").select("id").eq("country_code", country).ilike("name", name).maybeSingle();
  let clientId = existing?.id;
  if (!clientId) {
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, country_code: country, kind: text(form, "client_kind") })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    clientId = data.id;
  }

  const { data, error } = await supabase
    .from("deals")
    .insert({ ...dealFields(form), client_id: clientId, country_code: country })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/affaires");
  redirect(`/affaires/${data.id}`);
}

export async function updateDeal(id: string, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update(dealFields(form)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${id}`);
  revalidatePath("/affaires");
}

export async function addActivity(dealId: string, form: FormData) {
  const supabase = await createClient();
  const body = text(form, "body");
  if (!body) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("activities").insert({
    deal_id: dealId,
    kind: text(form, "kind") ?? "note",
    body,
    happened_on: text(form, "happened_on") ?? new Date().toISOString().slice(0, 10),
    author_id: user!.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${dealId}`);
}

export async function addPayment(dealId: string, form: FormData) {
  const supabase = await createClient();
  const amount = int(form, "amount");
  const paidOn = text(form, "paid_on");
  if (!amount || !paidOn) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("payments").insert({ deal_id: dealId, amount, paid_on: paidOn, created_by: user!.id });
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${dealId}`);
}

export async function deletePayment(dealId: string, paymentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${dealId}`);
}
