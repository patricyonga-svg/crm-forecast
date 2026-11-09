import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Ouvre la facture jointe à l'affaire (lien temporaire de 5 minutes), si l'utilisateur voit l'affaire. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("invoice_file_path, invoice_file_name").eq("id", id).maybeSingle();
  if (!deal?.invoice_file_path) return new NextResponse("Aucune facture jointe à cette affaire.", { status: 404 });
  const { data, error } = await supabase.storage.from("devis").createSignedUrl(deal.invoice_file_path, 300, { download: deal.invoice_file_name ?? true });
  if (error || !data) return new NextResponse(`Facture introuvable : ${error?.message ?? "erreur inconnue"}`, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
