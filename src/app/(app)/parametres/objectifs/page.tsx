import { redirect } from "next/navigation";
import { getReferences, getSession } from "@/lib/session";
import { currentQuarter, quarterRange } from "@/lib/domain";
import { ObjectivesGrid } from "@/components/ObjectivesGrid";
import { QuarterPicker } from "@/components/QuarterPicker";
import { addRep, saveObjectives, setRepActive } from "../actions";

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long" });

export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ trimestre?: string }> }) {
  const { trimestre = currentQuarter() } = await searchParams;
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin" && profile?.role !== "manager") redirect("/rapports");
  const isAdmin = profile.role === "admin";
  const refs = await getReferences(supabase);
  const { from, to, months } = quarterRange(trimestre);
  const { data: objectives } = await supabase.from("rep_objectives").select("sales_rep_id, month, amount").gte("month", from).lte("month", to);

  const initial: Record<number, Record<string, number>> = {};
  for (const o of objectives ?? []) (initial[o.sales_rep_id] ??= {})[o.month] = Number(o.amount) / 1_000_000;
  const monthOptions = months.map((m) => ({ value: m, label: MONTH.format(new Date(`${m}T00:00:00`)) }));
  const countries = refs.countries.filter((c) => isAdmin || c.code === profile.country_code);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Paramétrage</p>
          <h1 className="text-2xl font-extrabold">Objectifs commerciaux · {trimestre.replace("-", " ")}</h1>
          <p className="text-sm text-zinc-600">
            Montants en <strong>millions de XOF</strong> (45 = 45 M XOF) ; un montant complet comme 45 000 000 est aussi accepté. Saisissez l&apos;objectif de chaque mois, ou l&apos;objectif du trimestre qui sera réparti
            selon le phasage. L&apos;objectif d&apos;un pays est la somme de ceux de ses commerciaux.
          </p>
        </div>
        <QuarterPicker value={trimestre} />
      </div>

      {countries.map((c) => {
        const reps = refs.reps.filter((r) => r.country_code === c.code && r.active);
        const inactive = refs.reps.filter((r) => r.country_code === c.code && !r.active);
        return (
          <section key={c.code} className="card space-y-4">
            <h2 className="text-lg font-bold">{c.name}</h2>
            {reps.length ? (
              <form action={saveObjectives} className="space-y-3">
                <ObjectivesGrid reps={reps.map((r) => ({ id: r.id, name: r.display_name }))} months={monthOptions} initial={initial} />
                <button className="btn">Enregistrer les objectifs de {c.name}</button>
              </form>
            ) : (
              <p className="text-sm text-zinc-500">Aucun commercial actif.</p>
            )}
            {isAdmin && (
              <details className="text-sm">
                <summary className="cursor-pointer text-zinc-600">Gérer les commerciaux de {c.name}</summary>
                <div className="mt-3 space-y-3">
                  <form action={addRep} className="flex flex-wrap gap-2">
                    <input type="hidden" name="country_code" value={c.code} />
                    <input name="display_name" placeholder="Nom (ex. À recruter)" className="input max-w-xs" required />
                    <button className="btn-secondary">Ajouter</button>
                  </form>
                  <ul className="flex flex-wrap gap-2">
                    {[...reps, ...inactive].map((r) => (
                      <li key={r.id}>
                        <form action={setRepActive} className="flex items-center gap-2 rounded-full border border-zinc-200 py-1 pl-3 pr-1">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="active" value={String(!r.active)} />
                          <span className={r.active ? "" : "text-zinc-400 line-through"}>{r.display_name}</span>
                          <button className="rounded-full px-2 text-xs text-zinc-500 hover:bg-zinc-100">{r.active ? "Désactiver" : "Réactiver"}</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-zinc-500">Un commercial désactivé n&apos;apparaît plus dans la saisie ; ses affaires et son historique sont conservés.</p>
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
