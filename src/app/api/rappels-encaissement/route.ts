// Rappel hebdomadaire aux porteurs : affaires Won Pending dont les cartes sont livrées
// et dont moins de la moitié du montant est encaissée. Appelée chaque lundi par la tâche planifiée (vercel.json).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dealTitle, formatMoney, needsCollectionReminder } from "@/lib/domain";
import { emailConfigured, escapeHtml, sendMail } from "@/lib/email";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string | null;
  stage: string;
  cards_status: string | null;
  quote_amount: number;
  collected_amount: number;
  sales_rep_id: number | null;
  clients: { name: string };
  sales_reps: { display_name: string; email: string | null; profiles: { email: string } | null } | null;
};

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  if (!emailConfigured()) return NextResponse.json({ error: "service d'envoi d'emails non configuré" }, { status: 500 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("deal_amounts")
    .select("id, name, stage, cards_status, quote_amount, collected_amount, sales_rep_id, clients(name), sales_reps!sales_rep_id(display_name, email, profiles(email))")
    .eq("stage", "won_pending")
    .eq("cards_status", "livrees")
    .returns<Row[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Une seule relance par porteur, avec toutes ses affaires concernées.
  const byRep = new Map<string, { name: string; deals: Row[] }>();
  let withoutEmail = 0;
  for (const d of (data ?? []).filter(needsCollectionReminder)) {
    const email = d.sales_reps?.profiles?.email ?? d.sales_reps?.email;
    if (!email) {
      withoutEmail++;
      continue;
    }
    const entry = byRep.get(email) ?? { name: d.sales_reps!.display_name, deals: [] };
    entry.deals.push(d);
    byRep.set(email, entry);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://crm-forecast-susu-73c6.vercel.app";
  const results: { to: string; deals: number; status: string }[] = [];
  for (const [to, { name, deals }] of byRep) {
    const lines = deals.map((d) => {
      const rest = Number(d.quote_amount) - Number(d.collected_amount);
      return { title: `${dealTitle(d, d.clients.name)} (${d.clients.name})`, text: `encaissé ${formatMoney(d.collected_amount)} sur ${formatMoney(d.quote_amount)}, reste ${formatMoney(rest)}`, link: `${origin}/affaires/${d.id}` };
    });
    const intro = `Bonjour ${name}, les cartes de ${deals.length > 1 ? "ces affaires sont livrées" : "cette affaire sont livrées"} mais moins de la moitié du montant est encaissée. Pensez à finaliser l'encaissement.`;
    const result = await sendMail({
      to: [to],
      subject: `Cerise · ${deals.length} encaissement${deals.length > 1 ? "s" : ""} à finaliser`,
      text: [intro, "", ...lines.map((l) => `- ${l.title} : ${l.text}\n  ${l.link}`)].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#14213d"><p>${escapeHtml(intro)}</p><ul>${lines
        .map((l) => `<li style="margin:6px 0"><a href="${escapeHtml(l.link)}"><b>${escapeHtml(l.title)}</b></a> : ${escapeHtml(l.text)}</li>`)
        .join("")}</ul><p style="color:#6b7280;font-size:12px">Rappel envoyé chaque lundi tant que la moitié du montant n'est pas encaissée.</p></div>`,
    });
    results.push({ to, deals: deals.length, status: result.detail ? `${result.status} : ${result.detail}` : result.status });
  }
  return NextResponse.json({ ok: true, envoyes: results.length, sansEmail: withoutEmail, results });
}
