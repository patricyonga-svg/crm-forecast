import { getSession } from "@/lib/session";
import { savePipelineSettings } from "../actions";

export default async function PipelineSettingsPage() {
  const { supabase, profile } = await getSession();
  const { data: s } = await supabase.from("pipeline_settings").select("*").single();
  const isAdmin = profile?.role === "admin";
  const fm = Number(s?.forecast_multiple ?? 1);
  const pm = Number(s?.pipe_multiple ?? 3);
  const example = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Paramétrage</p>
        <h1 className="text-2xl font-extrabold">Monitoring du pipeline</h1>
        <p className="text-sm text-zinc-600">Ces deux multiples fixent le niveau minimal de forecast et de pipe attendu de chaque commercial et de chaque pays.</p>
      </div>

      <form action={savePipelineSettings} className="card space-y-5">
        <label className="block space-y-1">
          <span className="font-semibold">1. Multiple de forecast</span>
          <span className="block text-sm text-zinc-600">Forecast minimal = objectif du trimestre × ce multiple.</span>
          <input name="forecast_multiple" defaultValue={fm} inputMode="decimal" className="input max-w-32" disabled={!isAdmin} required />
        </label>
        <label className="block space-y-1">
          <span className="font-semibold">2. Multiple de pipe</span>
          <span className="block text-sm text-zinc-600">Pipe minimal = forecast minimal × ce multiple.</span>
          <input name="pipe_multiple" defaultValue={pm} inputMode="decimal" className="input max-w-32" disabled={!isAdmin} required />
        </label>
        <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
          Exemple avec les valeurs enregistrées : pour un objectif de 45 M XOF, il faut au moins <strong>{example(45 * fm)} M XOF</strong> de forecast et{" "}
          <strong>{example(45 * fm * pm)} M XOF</strong> de pipe.
        </p>
        {isAdmin ? <button className="btn">Enregistrer</button> : <p className="text-sm text-zinc-500">Seul un administrateur peut modifier ces valeurs.</p>}
      </form>

      <div className="card space-y-2 text-sm text-zinc-700">
        <h2 className="font-semibold text-zinc-900">Définitions utilisées dans les rapports</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Réalisé</strong> : montant des affaires Won Pending et Won dont la date de closing tombe dans la période.
          </li>
          <li>
            <strong>Forecast</strong> : réalisé + affaires au stade Forecast du trimestre.
          </li>
          <li>
            <strong>Pipe</strong> : toutes les affaires du trimestre (Opportunité, Forecast, Won Pending, Won).
          </li>
          <li>Les affaires encore ouvertes datées du trimestre précédent comptent dans le trimestre en cours. Les affaires sans date de closing ne comptent pas.</li>
        </ul>
      </div>
    </div>
  );
}
