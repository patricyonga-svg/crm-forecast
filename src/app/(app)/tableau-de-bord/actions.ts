"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveObjective(form: FormData) {
  const supabase = await createClient();
  const amount = Number(String(form.get("amount") ?? "").replace(/[\s  ]/g, ""));
  const { error } = await supabase.from("objectives").upsert({
    country_code: String(form.get("country_code")),
    business_line_id: Number(form.get("business_line_id")),
    month: String(form.get("month")),
    amount: Number.isFinite(amount) ? amount : 0,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tableau-de-bord");
}
