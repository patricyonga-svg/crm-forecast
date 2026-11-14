import Link from "next/link";
import { redirect } from "next/navigation";
import { getReferences, getSession } from "@/lib/session";
import { currentQuarter, quarterRange } from "@/lib/domain";
import { SdrObjectivesGrid } from "@/components/SdrObjectivesGrid";
import { QuarterPicker } from "@/components/QuarterPicker";
import type { SdrObjective } from "@/lib/sdr";
import { ActionForm } from "@/components/ActionForm";
import { saveSdrObjectives } from "../actions";

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long" });

export default async function SdrObjectivesPage({ searchParams }: { searchParams: Promise<{ trimestre?: string }> }) {
  const { trimestre = currentQuarter() } = await searchParams;
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin" && profile?.role !== "manager") redirect("/rapports/sdr");
  const isAdmin = profile.role === "admin";
  const refs = await getReferences(supabase);
  const { from, to, months } = quarterRange(trimestre);
  const { data: objectives } = await supabase
    .from("sdr_objectives")
    .select("sales_rep_id, month, new_leads, qualified_leads")
    .gte("month", from)
    .lte("month", to)
    .returns<SdrObjective[]>();

  const initial: Record<number, Record<string, { new: number; qual: number }>> = {};
  for (const o of objectives ?? []) (initial[o.sales_rep_id] ??= {})[o.month] = { new: Number(o.new_leads), qual: Number(o.qualified_leads) };
  const withObjective = new Set((objectives ?? []).map((o) => o.sales_rep_id));
  const monthOptions = months.map((m) => ({ value: m, label: MONTH.format(new Date(`${m}T00:00:00`)) }));
  const countries = refs.countries.filter((c) => isAdmin || c.code === profile.country_code);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Paramétrage</p>
          <h1 className="text-2xl font-extrabold">Objectifs SDR · {trimestre.replace("-", " ")}</h1>
          <p className="text-sm text-zinc-600">
            Objectifs de prospection de chaque SDR, en <strong>nombre de leads</strong> : nouveaux leads (affaires créées avec ce SDR) et leads
            qualifiés (passés en Opportunité). Saisissez chaque mois, ou le trimestre qui sera réparti selon le phasage. Les objectifs de vente
            des SDR se saisissent dans{" "}
            <Link href={`/parametres/objectifs?trimestre=${trimestre}`} className="underline">
              Objectifs AE
            </Link>
            .
          </p>
        </div>
        <QuarterPicker value={trimestre} />
      </div>

      {countries.map((c) => {
        const sdrs = refs.reps.filter((r) => r.country_code === c.code && ((r.is_sdr && r.active) || withObjective.has(r.id)));
        return (
          <section key={c.code} className="card space-y-4">
            <h2 className="text-lg font-bold">{c.name}</h2>
            {sdrs.length ? (
              <ActionForm action={saveSdrObjectives} submitLabel={`Enregistrer les objectifs SDR de ${c.name}`}>
                <SdrObjectivesGrid
                  key={`${trimestre}-${sdrs.map((r) => `${r.id}:${r.display_name}`).join(",")}`}
                  reps={sdrs.map((r) => ({ id: r.id, name: r.display_name }))}
                  months={monthOptions}
                  initial={initial}
                />
              </ActionForm>
            ) : (
              <p className="text-sm text-zinc-500">
                Aucun SDR dans ce pays. Pour en désigner un, ouvrez{" "}
                {isAdmin ? (
                  <Link href="/utilisateurs" className="underline">
                    Utilisateurs
                  </Link>
                ) : (
                  "Utilisateurs (administrateurs)"
                )}{" "}
                et donnez-lui le rôle « Commercial - SDR » avec son nom dans le fichier.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
