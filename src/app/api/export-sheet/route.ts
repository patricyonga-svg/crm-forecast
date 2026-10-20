// Copie des affaires vers le Google Sheet miroir. Appelée par la tâche planifiée (vercel.json).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { replaceSheet } from "@/lib/google-sheets";
import { STAGE_LABEL, type Stage } from "@/lib/domain";

export const dynamic = "force-dynamic";

type Row = {
  country_code: string;
  beneficiaries: number | null;
  quote_amount: number;
  stage: Stage;
  expected_close_date: string | null;
  closing_raw: string | null;
  forecast_amount: number;
  invoiced_amount: number;
  collected_amount: number;
  quarter_label: string | null;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
  clients: { name: string };
  countries: { name: string };
  business_lines: { name: string } | null;
  sales_reps: { display_name: string } | null;
};

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("deal_amounts")
    .select("*, clients(name), countries(name), business_lines(name), sales_reps(display_name)")
    .order("country_code")
    .returns<Row[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: (string | number)[][] = [
    [`Copie automatique du CRM, ne pas modifier. Mise à jour : ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Dakar" })}`],
    [
      "Nom client",
      "Pays",
      "Nombre de Bénéficiaire",
      "Montant Devis",
      "Date de Closing",
      "Sales Stage",
      "Montant Forecast",
      "Montant Facturé",
      "Montant encaissé",
      "Type",
      "Porteur (Commercial)",
      "Prochaine action",
      "Date prochaine action",
      "Trimestre",
      "Dernière modification",
    ],
    ...(data ?? []).map((d) => [
      d.clients.name,
      d.countries.name,
      d.beneficiaries ?? "",
      Number(d.quote_amount),
      d.expected_close_date ?? d.closing_raw ?? "",
      STAGE_LABEL[d.stage],
      Number(d.forecast_amount),
      Number(d.invoiced_amount),
      Number(d.collected_amount),
      d.business_lines?.name ?? "",
      d.sales_reps?.display_name ?? "",
      d.next_action ?? "",
      d.next_action_date ?? "",
      d.quarter_label ?? "",
      d.updated_at.slice(0, 10),
    ]),
  ];

  await replaceSheet(process.env.EXPORT_SPREADSHEET_ID!, process.env.EXPORT_SHEET_TAB ?? "Export CRM", rows);
  return NextResponse.json({ ok: true, deals: rows.length - 2 });
}
