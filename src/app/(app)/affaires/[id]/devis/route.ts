import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Ouvre le devis joint à l'affaire (lien temporaire de 5 minutes), si l'utilisateur voit l'affaire. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("quote_file_path, quote_file_name").eq("id", id).maybeSingle();
  if (!deal?.quote_file_path) return new NextResponse("Aucun devis joint à cette affaire.", { status: 404 });
  const { data, error } = await supabase.storage.from("devis").createSignedUrl(deal.quote_file_path, 300, { download: deal.quote_file_name ?? true });
  if (error || !data) return new NextResponse(`Devis introuvable : ${error?.message ?? "erreur inconnue"}`, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
