import { getSession } from "@/lib/session";
import { dealTitle, type Stage } from "@/lib/domain";
import { QuickAdd, type QuickDeal } from "@/components/QuickAdd";

type Row = { id: string; name: string | null; client_id: string; country_code: string; stage: Stage; updated_at: string | null; clients: { name: string } | null };

/** Ajout rapide depuis le téléphone : nouvelle affaire, rendez-vous ou contact sur une affaire existante. */
export default async function QuickAddPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("deals")
    .select("id, name, client_id, country_code, stage, updated_at, clients(name)")
    .not("stage", "eq", "perdu")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(2000)
    .returns<Row[]>();
  const deals: QuickDeal[] = (data ?? []).map((d) => ({
    id: d.id,
    clientId: d.client_id,
    title: dealTitle(d, d.clients?.name ?? ""),
    client: d.clients?.name ?? "",
    country: d.country_code,
    stage: d.stage,
  }));
  return <QuickAdd deals={deals} initial={type === "rdv" || type === "contact" ? type : null} />;
}
