import Link from "next/link";
import { notFound } from "next/navigation";
import { getReferences, getSession } from "@/lib/session";
import { formatDate, formatMoney, STAGE_LABEL, type Deal, type Stage } from "@/lib/domain";
import { StageBadge } from "@/components/StageBadge";
import { DealFields } from "@/components/DealFields";
import { addActivity, addPayment, deletePayment, updateDeal } from "../actions";

const KIND_LABEL: Record<string, string> = { note: "Note", appel: "Appel", rdv: "Rendez-vous", devis: "Devis", relance: "Relance" };

type AuditRow = { id: number; at: string; actor: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSession();
  const [{ data: deal }, refs, activities, payments, audit, profiles] = await Promise.all([
    supabase.from("deal_amounts").select("*, clients(name, kind, country_code)").eq("id", id).maybeSingle<Deal & { clients: { name: string; kind: string | null } }>(),
    getReferences(supabase),
    supabase.from("activities").select("*").eq("deal_id", id).order("happened_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("deal_id", id).order("paid_on"),
    supabase.from("audit_log").select("id, at, actor, old_data, new_data").eq("table_name", "deals").eq("row_id", id).order("at", { ascending: false }).limit(20).returns<AuditRow[]>(),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (!deal) notFound();

  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  const country = refs.countries.find((c) => c.code === deal.country_code);
  const currency = country?.currency ?? "XOF";
  const today = new Date().toISOString().slice(0, 10);
  const remaining = Number(deal.invoiced_amount) - Number(deal.collected_amount);

  return (
    <div className="space-y-4">
      <Link href="/affaires" className="text-sm text-zinc-600 hover:underline">
        ← Affaires
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{deal.clients.name}</h1>
        <StageBadge stage={deal.stage} />
        <span className="text-sm text-zinc-500">{country?.name}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["Devis", deal.quote_amount],
          ["Forecast", deal.forecast_amount],
          ["Facturé", deal.invoiced_amount],
          ["Encaissé", deal.collected_amount],
        ].map(([label, value]) => (
          <div key={label as string} className="card">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatMoney(value as number, currency)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form action={updateDeal.bind(null, deal.id)} className="card space-y-3">
            <h2 className="font-medium">Informations</h2>
            <DealFields refs={refs} deal={deal} country={deal.country_code} />
            <button className="btn">Enregistrer</button>
          </form>

          <div className="card space-y-3">
            <h2 className="font-medium">Historique</h2>
            <form action={addActivity.bind(null, deal.id)} className="grid gap-2 md:grid-cols-[8rem_10rem_1fr_auto]">
              <select name="kind" className="input">
                {Object.entries(KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input type="date" name="happened_on" defaultValue={today} className="input" />
              <input name="body" placeholder="Ce qui s'est passé, ce qui est attendu…" className="input" required />
              <button className="btn">Ajouter</button>
            </form>
            <ul className="divide-y divide-zinc-100">
              {(activities.data ?? []).map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <div className="text-xs text-zinc-500">
                    {formatDate(a.happened_on)} · {KIND_LABEL[a.kind]} · {a.author_id ? names.get(a.author_id) : a.author_label ?? "Ancien fichier"}
                  </div>
                  <p className="whitespace-pre-line">{a.body}</p>
                </li>
              ))}
              {(activities.data ?? []).length === 0 && <li className="py-2 text-sm text-zinc-500">Aucune note pour l&apos;instant.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="font-medium">Encaissements</h2>
            {deal.stage === "won" ? (
              <p className="text-sm text-zinc-600">Affaire Won : considérée comme entièrement encaissée.</p>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {(payments.data ?? []).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>{formatDate(p.paid_on)}</span>
                      <span className="tabular-nums">{formatMoney(p.amount, currency)}</span>
                      <form action={deletePayment.bind(null, deal.id, p.id)}>
                        <button className="text-xs text-red-700 hover:underline">Supprimer</button>
                      </form>
                    </li>
                  ))}
                </ul>
                {deal.stage === "won_pending" && <p className="text-xs text-zinc-500">Reste à encaisser : {formatMoney(remaining, currency)}</p>}
                <form action={addPayment.bind(null, deal.id)} className="grid grid-cols-2 gap-2">
                  <input type="date" name="paid_on" defaultValue={today} className="input" required />
                  <input type="number" name="amount" min={1} placeholder="Montant" className="input" required />
                  <button className="btn-secondary col-span-2">Ajouter un paiement</button>
                </form>
                <p className="text-xs text-zinc-500">Passez l&apos;affaire en Won une fois le paiement complet reçu.</p>
              </>
            )}
          </div>

          <div className="card space-y-2">
            <h2 className="font-medium">Modifications</h2>
            <ul className="space-y-2 text-xs text-zinc-600">
              {(audit.data ?? []).map((a) => (
                <li key={a.id}>
                  <span className="text-zinc-500">{new Date(a.at).toLocaleString("fr-FR")}</span> · {a.actor ? names.get(a.actor) ?? "?" : "Import"}
                  <div>{describeChange(a)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  stage: "Étape",
  quote_amount: "Montant",
  expected_close_date: "Closing",
  sales_rep_id: "Porteur",
  business_line_id: "LoB",
  beneficiaries: "Bénéficiaires",
  next_action: "Prochaine action",
  next_action_date: "Date de prochaine action",
};

function describeChange(a: AuditRow): string {
  if (!a.old_data) return "Création";
  if (!a.new_data) return "Suppression";
  const changes = Object.keys(FIELD_LABEL)
    .filter((k) => JSON.stringify(a.old_data![k]) !== JSON.stringify(a.new_data![k]))
    .map((k) => {
      const fmt = (v: unknown) => (k === "stage" ? STAGE_LABEL[v as Stage] : v ?? "—");
      return `${FIELD_LABEL[k]} : ${fmt(a.old_data![k])} → ${fmt(a.new_data![k])}`;
    });
  return changes.join(" ; ") || "Aucun champ suivi modifié";
}
