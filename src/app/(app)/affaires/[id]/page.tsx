import { SubmitButton } from "@/components/SubmitButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReferences, getSession } from "@/lib/session";
import {
  contactName,
  dealTitle,
  formatDate,
  formatDateTime,
  formatMoney,
  SECTORS,
  STAGE_LABEL,
  STAGES,
  type Appointment,
  type Client,
  type Contact,
  type Deal,
  type Stage,
} from "@/lib/domain";
import { StageBadge } from "@/components/StageBadge";
import { DealFields } from "@/components/DealFields";
import { ActionForm } from "@/components/ActionForm";
import { ContactFields } from "@/components/ContactFields";
import { ContactPicker } from "@/components/ContactPicker";
import { LocalDateTime } from "@/components/LocalDateTime";
import { YesNo } from "@/components/YesNo";
import {
  addActivity,
  addContact,
  addPayment,
  bookAppointment,
  cancelAppointment,
  deletePayment,
  linkContact,
  reportAppointment,
  unlinkContact,
  updateClient,
  updateContact,
  updateDeal,
} from "../actions";

const KIND_LABEL: Record<string, string> = { note: "Note", appel: "Appel", rdv: "Rendez-vous", devis: "Devis", relance: "Relance" };

type AuditRow = { id: number; at: string; actor: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ action?: string }> }) {
  const { id } = await params;
  const { action } = await searchParams;
  const { supabase, profile } = await getSession();
  const [{ data: deal }, refs, activities, payments, audit, profiles, links, appts] = await Promise.all([
    supabase.from("deal_amounts").select("*, clients(*)").eq("id", id).maybeSingle<Deal & { clients: Client }>(),
    getReferences(supabase),
    supabase.from("activities").select("*").eq("deal_id", id).order("happened_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("deal_id", id).order("paid_on"),
    supabase.from("audit_log").select("id, at, actor, old_data, new_data").eq("table_name", "deals").eq("row_id", id).order("at", { ascending: false }).limit(20).returns<AuditRow[]>(),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("deal_contacts").select("contact_id").eq("deal_id", id),
    supabase.from("appointments").select("*").eq("deal_id", id).order("starts_at", { ascending: false }).returns<Appointment[]>(),
  ]);
  if (!deal) notFound();
  const client = deal.clients;
  const { data: companyContacts } = await supabase.from("contacts").select("*").eq("client_id", client.id).order("last_name").returns<Contact[]>();

  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  const repName = new Map(refs.reps.map((r) => [r.id, r.display_name]));
  const country = refs.countries.find((c) => c.code === deal.country_code);
  const currency = country?.currency ?? "XOF";
  const today = new Date().toISOString().slice(0, 10);
  const remaining = Number(deal.invoiced_amount) - Number(deal.collected_amount);
  const linked = new Set((links.data ?? []).map((l) => l.contact_id));
  const contacts = companyContacts ?? [];
  const dealContacts = contacts.filter((c) => linked.has(c.id));
  const otherContacts = contacts.filter((c) => !linked.has(c.id));
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const pickable = [...dealContacts, ...otherContacts];
  const appointments = appts.data ?? [];
  const pending = appointments.filter((a) => !a.reported_at);
  const countryReps = refs.reps.filter((r) => r.active !== false && (!r.country_code || r.country_code === deal.country_code));
  const myRep = refs.reps.find((r) => r.profile_id === profile?.id);
  const title = dealTitle(deal, client.name);
  const stageIndex = STAGES.findIndex((s) => s.value === deal.stage);

  return (
    <div className="space-y-4">
      <Link href="/affaires" className="text-sm text-zinc-600 hover:underline">
        ← Affaires
      </Link>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{title}</h1>
          <StageBadge stage={deal.stage} />
        </div>
        <p className="text-sm text-zinc-500">
          {client.name}
          {client.sector && ` · ${client.sector}`} · {country?.name}
        </p>
      </div>

      {/* Avancement dans le cycle de vente */}
      <ol className="flex overflow-x-auto rounded-xl border border-zinc-200 bg-white text-xs">
        {STAGES.map((s, i) => {
          const done = deal.stage !== "perdu" && deal.stage !== "a_relancer" && i < stageIndex && i < 7;
          const current = s.value === deal.stage;
          return (
            <li
              key={s.value}
              title={s.help}
              className={`flex-1 whitespace-nowrap border-r border-zinc-100 px-3 py-2 text-center last:border-r-0 ${
                current ? "bg-brand-navy font-semibold text-white" : done ? "bg-blue-50 text-brand-blue" : "text-zinc-500"
              }`}
            >
              {s.label}
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["Montant potentiel", deal.quote_amount],
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
          <div className="card">
            <ActionForm action={updateDeal.bind(null, deal.id)}>
              <h2 className="font-medium">Informations</h2>
              <DealFields refs={refs} deal={{ ...deal, name: deal.name ?? client.name }} country={deal.country_code} />
              <p className="text-xs text-zinc-500">
                Les étapes « Prise de rendez-vous » et « CR de rendez-vous » ouvrent leur formulaire ci-dessous.
              </p>
            </ActionForm>
          </div>

          {/* Rendez-vous */}
          <div id="rdv" className="card scroll-mt-4 space-y-3">
            <h2 className="font-medium">Rendez-vous</h2>
            {appointments.length === 0 && <p className="text-sm text-zinc-500">Aucun rendez-vous pour l&apos;instant.</p>}
            <ul className="space-y-3">
              {appointments.map((a) => {
                const met = byId.get(a.report_contact_id ?? a.contact_id ?? "");
                const yn = (b: boolean | null) => (b ? "oui" : b === false ? "non" : "?");
                return (
                  <li key={a.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{formatDateTime(a.starts_at, deal.country_code)}</span> · {repName.get(a.sales_rep_id) ?? "?"}
                        {met && ` avec ${contactName(met)}`}
                        {a.location && ` · ${a.location}`}
                      </div>
                      {a.reported_at ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Compte rendu fait</span>
                      ) : (
                        <form action={cancelAppointment.bind(null, deal.id, a.id)}>
                          <button className="text-xs text-red-700 hover:underline">Annuler le rendez-vous</button>
                        </form>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Pris par {a.booked_by ? names.get(a.booked_by) ?? "?" : "?"}
                      {a.email_status && ` · email : ${a.email_status === "envoye" ? "envoyé" : a.email_status === "non_configure" ? "service d'envoi non configuré" : a.email_status}`}
                    </div>
                    {a.notes && <p className="mt-1 whitespace-pre-line">{a.notes}</p>}
                    {a.reported_at ? (
                      <p className="mt-2 rounded-md bg-zinc-50 p-2">
                        Décideur : {yn(a.report_decision_maker)} · Besoin : {yn(a.report_need)} · Budget : {yn(a.report_budget)}
                        {a.report_close_date && ` · Closing potentiel : ${formatDate(a.report_close_date)}`}
                        {a.report_notes && <span className="mt-1 block whitespace-pre-line">{a.report_notes}</span>}
                      </p>
                    ) : (
                      <details id={a.id === pending[0]?.id ? "cr" : undefined} open={action === "cr" && a.id === pending[0]?.id} className="mt-2 scroll-mt-4">
                        <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Saisir le compte rendu</summary>
                        <ReportForm dealId={deal.id} appointment={a} contacts={pickable} />
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>

            {action === "cr" && pending.length === 0 && (
              <div id="cr" className="scroll-mt-4 rounded-lg border border-brand-blue/40 bg-blue-50/40 p-3">
                <h3 className="mb-2 text-sm font-semibold">Compte rendu d&apos;un rendez-vous déjà eu</h3>
                <ReportForm dealId={deal.id} contacts={pickable} reps={countryReps} defaultRep={deal.sales_rep_id ?? myRep?.id ?? null} />
              </div>
            )}

            <details open={action === "rdv" || (deal.stage === "prise_rdv" && appointments.length === 0)} className="rounded-lg border border-zinc-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Prendre un rendez-vous pour un commercial</summary>
              <ActionForm action={bookAppointment.bind(null, deal.id)} className="mt-3 space-y-3" submitLabel="Réserver le rendez-vous" pendingLabel="Réservation…" resetOnSuccess>
                {action === "rdv" && <input type="hidden" name="move" value="1" />}
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-600">Commercial *</span>
                    <select name="sales_rep_id" required defaultValue={deal.sales_rep_id ?? ""} className="input">
                      <option value="">—</option>
                      {countryReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-600">Date et heure *</span>
                    <LocalDateTime name="starts_at" required />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-600">Durée</span>
                    <select name="duration_minutes" defaultValue="60" className="input">
                      {[
                        [30, "30 min"],
                        [45, "45 min"],
                        [60, "1 h"],
                        [90, "1 h 30"],
                        [120, "2 h"],
                      ].map(([m, label]) => (
                        <option key={m} value={m}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-600">Lieu ou lien de visio</span>
                    <input name="location" className="input" placeholder="Adresse, Google Meet…" />
                  </label>
                </div>
                <ContactPicker name="contact_id" prefix="rdv_" contacts={pickable} label="Personne à rencontrer *" />
                <label className="block space-y-1 text-sm">
                  <span className="text-zinc-600">Notes pour le commercial</span>
                  <textarea name="notes" rows={2} className="input" />
                </label>
                <p className="text-xs text-zinc-500">Un email part vers le commercial et vers vous si vous n&apos;êtes pas le commercial.</p>
              </ActionForm>
            </details>
          </div>

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
              <SubmitButton pendingLabel="Ajout…">Ajouter</SubmitButton>
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
          {/* Entreprise */}
          <div className="card">
            <ActionForm action={updateClient.bind(null, client.id, deal.id)} className="space-y-2">
              <h2 className="font-medium">Entreprise : {client.name}</h2>
              <label className="block space-y-1 text-sm">
                <span className="text-zinc-600">Secteur</span>
                <input name="sector" list="sectors" defaultValue={client.sector ?? ""} className="input" autoComplete="off" />
                <datalist id="sectors">
                  {SECTORS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-600">Effectif</span>
                  <input name="headcount" type="number" min={0} defaultValue={client.headcount ?? ""} className="input" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-600">Type</span>
                  <select name="client_kind" defaultValue={client.kind ?? ""} className="input">
                    <option value="">—</option>
                    <option value="entreprise">Entreprise</option>
                    <option value="famille">Famille</option>
                    <option value="particulier">Particulier</option>
                  </select>
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-zinc-600">Contact principal</span>
                <select name="primary_contact_id" defaultValue={client.primary_contact_id ?? ""} className="input">
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {contactName(c)}
                      {c.job_title ? ` · ${c.job_title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          </div>

          {/* Contacts */}
          <div className="card space-y-3">
            <h2 className="font-medium">Contacts de l&apos;affaire</h2>
            {dealContacts.length === 0 && <p className="text-sm text-zinc-500">Aucun contact rattaché à l&apos;affaire.</p>}
            <ul className="space-y-2">
              {dealContacts.map((c) => (
                <ContactItem key={c.id} contact={c} dealId={deal.id} primary={c.id === client.primary_contact_id} />
              ))}
            </ul>
            {otherContacts.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Autres contacts de l&apos;entreprise</h3>
                <ul className="space-y-1 text-sm">
                  {otherContacts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span>
                        {contactName(c)}
                        {c.job_title && <span className="text-zinc-500"> · {c.job_title}</span>}
                        {c.id === client.primary_contact_id && <span className="text-xs text-amber-700"> ★ principal</span>}
                      </span>
                      <form action={linkContact.bind(null, deal.id, c.id)}>
                        <button className="text-xs font-semibold text-brand-blue hover:underline">Rattacher</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details className="rounded-lg border border-zinc-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Ajouter un contact</summary>
              <ActionForm action={addContact.bind(null, deal.id, client.id)} className="mt-3 space-y-3" submitLabel="Ajouter le contact" resetOnSuccess>
                <ContactFields />
              </ActionForm>
            </details>
          </div>

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
                  <SubmitButton className="btn-secondary col-span-2" pendingLabel="Ajout…">Ajouter un paiement</SubmitButton>
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

function ContactItem({ contact: c, dealId, primary }: { contact: Contact; dealId: string; primary: boolean }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{contactName(c)}</span>
        {primary && <span className="text-xs text-amber-700">★ principal</span>}
        {c.is_decision_maker && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Décideur</span>}
      </div>
      {c.job_title && <div className="text-zinc-600">{c.job_title}</div>}
      <div className="text-xs text-zinc-600">
        {c.email && (
          <a href={`mailto:${c.email}`} className="hover:underline">
            {c.email}
          </a>
        )}
        {c.email && c.phone && " · "}
        {c.phone && (
          <a href={`tel:${c.phone}`} className="hover:underline">
            {c.phone}
          </a>
        )}
      </div>
      {c.comment && <p className="text-xs text-zinc-500">{c.comment}</p>}
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-brand-blue">Modifier</summary>
        <ActionForm action={updateContact.bind(null, c.id, dealId)} className="mt-2 space-y-2">
          <ContactFields contact={c} />
        </ActionForm>
        <form action={unlinkContact.bind(null, dealId, c.id)} className="mt-2">
          <button className="text-xs text-red-700 hover:underline">Retirer de l&apos;affaire</button>
        </form>
      </details>
    </li>
  );
}

function ReportForm({
  dealId,
  appointment,
  contacts,
  reps,
  defaultRep,
}: {
  dealId: string;
  appointment?: Appointment;
  contacts: Contact[];
  reps?: { id: number; display_name: string }[];
  defaultRep?: number | null;
}) {
  return (
    <ActionForm action={reportAppointment.bind(null, dealId, appointment?.id ?? null)} className="mt-3 space-y-3" submitLabel="Enregistrer le compte rendu">
      {!appointment && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Commercial *</span>
            <select name="sales_rep_id" required defaultValue={defaultRep ?? ""} className="input">
              <option value="">—</option>
              {(reps ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600">Date du rendez-vous *</span>
            <input type="date" name="met_on" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
          </label>
        </div>
      )}
      <ContactPicker name="report_contact_id" prefix="cr_" contacts={contacts} label="Rendez-vous eu avec *" defaultValue={appointment?.contact_id} />
      <div className="flex flex-wrap gap-4">
        <YesNo name="report_decision_maker" label="Est-ce un décideur ?" />
        <YesNo name="report_need" label="Y a-t-il un besoin ?" />
        <YesNo name="report_budget" label="Y a-t-il du budget ?" />
      </div>
      <label className="block space-y-1 text-sm md:w-1/2">
        <span className="text-zinc-600">Échéance potentielle du closing</span>
        <input type="date" name="report_close_date" className="input" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-zinc-600">Compte rendu</span>
        <textarea name="report_notes" rows={3} className="input" placeholder="Ce qui a été dit, prochaines étapes…" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="to_opportunity" value="1" className="accent-brand-blue" />
        Lead qualifié : passer l&apos;affaire en « {STAGE_LABEL.opportunite} »
      </label>
    </ActionForm>
  );
}

const FIELD_LABEL: Record<string, string> = {
  name: "Nom",
  stage: "Étape",
  quote_amount: "Montant",
  expected_close_date: "Closing",
  sales_rep_id: "Porteur",
  business_line_id: "LoB",
  beneficiaries: "Bénéficiaires",
  next_action: "Prochaine action",
  next_action_date: "Date de prochaine action",
  comment: "Commentaire",
};

function describeChange(a: AuditRow): string {
  if (!a.old_data) return "Création";
  if (!a.new_data) return "Suppression";
  const changes = Object.keys(FIELD_LABEL)
    .filter((k) => JSON.stringify(a.old_data![k] ?? null) !== JSON.stringify(a.new_data![k] ?? null))
    .map((k) => {
      const fmt = (v: unknown) => (k === "stage" ? STAGE_LABEL[v as Stage] : v ?? "—");
      return `${FIELD_LABEL[k]} : ${fmt(a.old_data![k])} → ${fmt(a.new_data![k])}`;
    });
  return changes.join(" ; ") || "Aucun champ suivi modifié";
}
