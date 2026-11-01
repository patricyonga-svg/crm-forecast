import { STAGES, type Deal } from "@/lib/domain";

type Refs = {
  lines: { id: number; name: string }[];
  reps: { id: number; display_name: string; country_code: string | null }[];
};

/** Champs communs à la création et à la modification d'une affaire. */
export function DealFields({
  refs,
  deal,
  country,
  showStage = true,
  commentRequired = false,
}: {
  refs: Refs;
  deal?: Partial<Deal>;
  country?: string;
  showStage?: boolean;
  commentRequired?: boolean;
}) {
  const reps = country ? refs.reps.filter((r) => !r.country_code || r.country_code === country) : refs.reps;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-zinc-600">Nom de l&apos;affaire *</span>
        <input name="name" defaultValue={deal?.name ?? ""} required className="input" placeholder="Ex. Assurance santé du personnel 2027" />
      </label>
      {showStage && (
        <label className="space-y-1 text-sm">
          <span className="text-zinc-600">Étape</span>
          <select name="stage" defaultValue={deal?.stage ?? "opportunite"} className="input">
            {STAGES.map((s) => (
              <option key={s.value} value={s.value} title={s.help}>
                {s.label} : {s.help}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Montant potentiel (XOF) *</span>
        <input name="quote_amount" type="number" min={0} step={1} defaultValue={deal?.quote_amount ?? 0} className="input" required />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Date de closing prévue</span>
        <input name="expected_close_date" type="date" defaultValue={deal?.expected_close_date ?? ""} className="input" />
        {deal?.closing_raw && <span className="text-xs text-amber-700">Dans l&apos;ancien fichier : « {deal.closing_raw} »</span>}
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Nombre de bénéficiaires</span>
        <input name="beneficiaries" type="number" min={0} defaultValue={deal?.beneficiaries ?? ""} className="input" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Ligne de business</span>
        <select name="business_line_id" defaultValue={deal?.business_line_id ?? ""} className="input">
          <option value="">—</option>
          {refs.lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Porteur</span>
        <select name="sales_rep_id" defaultValue={deal?.sales_rep_id ?? ""} className="input">
          <option value="">—</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Prochaine action</span>
        <input name="next_action" defaultValue={deal?.next_action ?? ""} placeholder="Ex. relancer pour validation du devis" className="input" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-zinc-600">Date de la prochaine action</span>
        <input name="next_action_date" type="date" defaultValue={deal?.next_action_date ?? ""} className="input" />
      </label>
      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-zinc-600">Commentaire{commentRequired && " *"}</span>
        <textarea name="comment" defaultValue={deal?.comment ?? ""} required={commentRequired} rows={2} className="input" />
      </label>
    </div>
  );
}
