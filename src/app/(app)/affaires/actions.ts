"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Contact, contactName, formatDateTime, isCardsStatus, isStage, QUOTE_REQUIRED_STAGES, STAGE_LABEL, dealTitle, type Stage } from "@/lib/domain";
import { calendarInvite, emailConfigured, escapeHtml, googleCalendarLink, sendMail } from "@/lib/email";

export type FormState = { error?: string; ok?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function text(form: FormData, name: string): string | null {
  const v = String(form.get(name) ?? "").trim();
  return v === "" ? null : v;
}

function int(form: FormData, name: string): number | null {
  const v = text(form, name);
  if (v === null) return null;
  const n = Number(v.replace(/[\s  ]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

const yesNo = (form: FormData, name: string): boolean | null => (text(form, name) === "oui" ? true : text(form, name) === "non" ? false : null);

/** Champs d'un contact saisis avec un préfixe (« contact_last_name », « rdv_last_name »…). */
function contactFields(form: FormData, prefix: string) {
  return {
    last_name: text(form, `${prefix}last_name`),
    first_name: text(form, `${prefix}first_name`),
    job_title: text(form, `${prefix}job_title`),
    is_decision_maker: yesNo(form, `${prefix}is_decision_maker`),
    email: text(form, `${prefix}email`),
    phone: text(form, `${prefix}phone`),
    comment: text(form, `${prefix}comment`),
  };
}

const hasContactInput = (c: ReturnType<typeof contactFields>) => Object.values(c).some((v) => v !== null);

async function insertContact(supabase: Supabase, clientId: string, dealId: string | null, c: ReturnType<typeof contactFields>) {
  if (!c.last_name) throw new Error("Le nom du contact est obligatoire.");
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...c, last_name: c.last_name, client_id: clientId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (dealId) await supabase.from("deal_contacts").upsert({ deal_id: dealId, contact_id: data.id });
  return data.id as string;
}

function dealFields(form: FormData) {
  const stage = text(form, "stage");
  if (!isStage(stage)) throw new Error("Étape invalide.");
  const name = text(form, "name");
  if (!name) throw new Error("Le nom de l'affaire est obligatoire.");
  const amount = int(form, "quote_amount");
  if (amount === null || amount < 0) throw new Error("Le montant potentiel est obligatoire (0 accepté).");
  return {
    name,
    comment: text(form, "comment"),
    business_line_id: int(form, "business_line_id"),
    sales_rep_id: int(form, "sales_rep_id"),
    beneficiaries: int(form, "beneficiaries"),
    quote_amount: amount,
    stage: stage as Stage,
    expected_close_date: text(form, "expected_close_date"),
    next_action: text(form, "next_action"),
    next_action_date: text(form, "next_action_date"),
    cards_status: isCardsStatus(text(form, "cards_status")) ? text(form, "cards_status") : null,
    sdr_id: int(form, "sdr_id"),
    expected_payment_date: text(form, "expected_payment_date"),
    // Devis : seulement quand un nouveau fichier vient d'être envoyé (sinon on garde celui déjà joint).
    ...quoteFields(form),
  };
}

/** Chemin et nom du devis envoyé depuis le formulaire (fichier déjà déposé dans l'espace « devis »). */
function quoteFields(form: FormData): { quote_file_path?: string; quote_file_name?: string } {
  const path = text(form, "quote_file_path");
  if (!path || !/^[\w-]+\/\d+-[\w.-]+$/.test(path)) return {};
  return { quote_file_path: path, quote_file_name: text(form, "quote_file_name") ?? path.split("/").pop()! };
}

const CARDS_REQUIRED = "Pour passer en « Won Pending », indiquez si les cartes sont livrées, non livrées ou désactivées.";
const PAYMENT_DATE_REQUIRED = "Pour passer en « Won Pending », la date prévisionnelle d'encaissement est obligatoire.";
const quoteRequired = (stage: Stage) => `Pour passer en « ${STAGE_LABEL[stage]} », joignez le devis.`;

/** Ce qui manque pour passer à une étape de vente : devis, cartes, date prévisionnelle d'encaissement. */
function salesStageProblem(stage: Stage, d: { quote_file_path?: string | null; cards_status?: string | null; expected_payment_date?: string | null }): string | null {
  const missing: string[] = [];
  if (QUOTE_REQUIRED_STAGES.includes(stage) && !d.quote_file_path) missing.push(quoteRequired(stage));
  if (stage === "won_pending" && !d.cards_status) missing.push(CARDS_REQUIRED);
  if (stage === "won_pending" && !d.expected_payment_date) missing.push(PAYMENT_DATE_REQUIRED);
  return missing.length ? missing.join(" ") : null;
}

const fail = (e: unknown): FormState => {
  // redirect() lève une exception spéciale qu'il faut laisser passer.
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
  return { error: e instanceof Error ? e.message : String(e) };
};

/** Étapes qui passent par un formulaire : on y envoie l'utilisateur au lieu de changer l'étape directement. */
const FORM_FOR_STAGE: Partial<Record<Stage, string>> = { prise_rdv: "rdv", cr_rdv: "cr" };

// Affaires -------------------------------------------------------------------------

export async function createDeal(_prev: FormState, form: FormData): Promise<FormState> {
  let target: string;
  try {
    const supabase = await createClient();
    const fields = dealFields(form);
    const country = text(form, "country_code");
    const clientName = text(form, "client_name");
    if (!country || !clientName) throw new Error("L'entreprise et le pays sont obligatoires.");
    const sector = text(form, "sector");
    const contact = contactFields(form, "contact_");
    const salesProblem = salesStageProblem(fields.stage, fields);
    if (salesProblem) throw new Error(salesProblem);
    // Réutilise l'entreprise existante du même pays plutôt que de créer un doublon, et complète ce qui manque.
    const { data: existing } = await supabase
      .from("clients")
      .select("id, sector, headcount")
      .eq("country_code", country)
      .ilike("name", clientName)
      .order("created_at")
      .limit(1);
    let clientId = existing?.[0]?.id as string | undefined;
    if (fields.stage === "a_contacter") {
      if (!sector && !existing?.[0]?.sector) throw new Error("À l'étape « À contacter », le secteur de l'entreprise est obligatoire.");
      if (!fields.comment) throw new Error("À l'étape « À contacter », le commentaire est obligatoire.");
      if (!contact.last_name) throw new Error("À l'étape « À contacter », il faut au moins un contact (nom obligatoire).");
    }
    const headcount = int(form, "headcount");
    if (clientId) {
      const patch: Record<string, unknown> = {};
      if (sector && !existing![0].sector) patch.sector = sector;
      if (headcount !== null && existing![0].headcount === null) patch.headcount = headcount;
      if (Object.keys(patch).length) await supabase.from("clients").update(patch).eq("id", clientId);
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: clientName, country_code: country, kind: text(form, "client_kind"), sector, headcount })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      clientId = data.id as string;
    }

    // Filet de sécurité contre le double envoi : la même affaire créée il y a moins d'une minute est réutilisée.
    const { data: recent } = await supabase
      .from("deals")
      .select("id")
      .eq("client_id", clientId)
      .eq("name", fields.name)
      .eq("quote_amount", fields.quote_amount)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (recent?.[0]) redirect(`/affaires/${recent[0].id}`);

    const { data, error } = await supabase
      .from("deals")
      .insert({ ...fields, client_id: clientId, country_code: country })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (hasContactInput(contact)) await insertContact(supabase, clientId, data.id, contact);
    revalidatePath("/affaires");
    const next = FORM_FOR_STAGE[fields.stage];
    target = `/affaires/${data.id}${next ? `?action=${next}#${next}` : ""}`;
  } catch (e) {
    return fail(e);
  }
  redirect(target);
}

type SalesInput = { quote_file_path?: string | null; cards_status?: string | null; expected_payment_date?: string | null };

async function stageProblem(supabase: Supabase, dealId: string, stage: Stage, input: SalesInput = {}): Promise<string | null> {
  if (QUOTE_REQUIRED_STAGES.includes(stage)) {
    const { data } = await supabase
      .from("deals")
      .select("quote_file_path, cards_status, expected_payment_date")
      .eq("id", dealId)
      .single<{ quote_file_path: string | null; cards_status: string | null; expected_payment_date: string | null }>();
    return salesStageProblem(stage, {
      quote_file_path: input.quote_file_path || data?.quote_file_path,
      cards_status: input.cards_status || data?.cards_status,
      expected_payment_date: input.expected_payment_date || data?.expected_payment_date,
    });
  }
  if (stage !== "a_contacter") return null;
  const { data: deal } = await supabase.from("deals").select("comment, clients(sector)").eq("id", dealId).single<{ comment: string | null; clients: { sector: string | null } }>();
  const { count } = await supabase.from("deal_contacts").select("contact_id", { count: "exact", head: true }).eq("deal_id", dealId);
  const missing = [!count && "au moins un contact", !deal?.clients?.sector && "le secteur de l'entreprise", !deal?.comment && "un commentaire"].filter(Boolean);
  return missing.length ? `Pour passer à « À contacter », il manque : ${missing.join(", ")}.` : null;
}

export async function updateDeal(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  let target: string | null = null;
  try {
    const supabase = await createClient();
    const fields = dealFields(form);
    const { data: current } = await supabase.from("deals").select("stage").eq("id", id).single<{ stage: Stage }>();
    const changing = current && current.stage !== fields.stage;
    let patch: Partial<typeof fields> = fields;
    if (changing && FORM_FOR_STAGE[fields.stage]) {
      // Le passage à cette étape se fait par son formulaire (rendez-vous ou compte rendu).
      patch = { ...fields, stage: current.stage };
      target = `/affaires/${id}?action=${FORM_FOR_STAGE[fields.stage]}#${FORM_FOR_STAGE[fields.stage]}`;
    } else if (changing) {
      const problem = await stageProblem(supabase, id, fields.stage, fields);
      if (problem) {
        // Le reste est enregistré quand même pour que la saisie ne soit pas perdue.
        await supabase.from("deals").update({ ...fields, stage: current.stage }).eq("id", id);
        revalidatePath(`/affaires/${id}`);
        return { error: `${problem} Les autres modifications sont enregistrées.` };
      }
    }
    const { data, error } = await supabase.from("deals").update(patch).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Vous ne pouvez pas modifier cette affaire (réservé à son porteur, au manager du pays et aux administrateurs).");
    revalidatePath(`/affaires/${id}`);
    revalidatePath("/affaires");
  } catch (e) {
    return fail(e);
  }
  if (target) redirect(target);
  return { ok: "Enregistré." };
}

export type MoveExtra = { cards?: string; paymentDate?: string; quotePath?: string; quoteName?: string };

/** Glisser-déposer dans le pipe. Renvoie l'adresse du formulaire à ouvrir pour les étapes qui en ont un. */
export async function moveDeal(id: string, stage: string, extra: MoveExtra = {}): Promise<{ error?: string; redirectTo?: string }> {
  if (!isStage(stage)) return { error: "Étape invalide." };
  if (FORM_FOR_STAGE[stage]) return { redirectTo: `/affaires/${id}?action=${FORM_FOR_STAGE[stage]}#${FORM_FOR_STAGE[stage]}` };
  const form = new FormData();
  if (extra.quotePath) form.set("quote_file_path", extra.quotePath);
  if (extra.quoteName) form.set("quote_file_name", extra.quoteName);
  const patch: Record<string, unknown> = {
    stage,
    ...(isCardsStatus(extra.cards) ? { cards_status: extra.cards } : {}),
    ...(extra.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(extra.paymentDate) ? { expected_payment_date: extra.paymentDate } : {}),
    ...quoteFields(form),
  };
  const supabase = await createClient();
  const problem = await stageProblem(supabase, id, stage, patch as SalesInput);
  if (problem) return { error: problem, redirectTo: `/affaires/${id}` };
  const { data, error } = await supabase.from("deals").update(patch).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Vous ne pouvez pas modifier cette affaire (réservé à son porteur, au manager du pays et aux administrateurs)." };
  revalidatePath("/affaires");
  revalidatePath(`/affaires/${id}`);
  return {};
}

/** Contacts et commerciaux pour ouvrir le formulaire de rendez-vous depuis le pipe. */
export async function getBookingData(dealId: string) {
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("client_id, country_code, sales_rep_id").eq("id", dealId).single();
  if (!deal) return null;
  const [{ data: contacts }, { data: links }, { data: reps }] = await Promise.all([
    supabase.from("contacts").select("*").eq("client_id", deal.client_id).order("last_name"),
    supabase.from("deal_contacts").select("contact_id").eq("deal_id", dealId),
    supabase.from("sales_reps").select("id, display_name, country_code, active").order("display_name"),
  ]);
  const linked = new Set((links ?? []).map((l) => l.contact_id));
  const all = (contacts ?? []) as Contact[];
  return {
    contacts: [...all.filter((c) => linked.has(c.id)), ...all.filter((c) => !linked.has(c.id))],
    reps: (reps ?? []).filter((r) => r.active !== false && (!r.country_code || r.country_code === deal.country_code)),
    defaultRep: deal.sales_rep_id as number | null,
  };
}

// Entreprise et contacts ----------------------------------------------------------------

export async function updateClient(clientId: string, dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({
      sector: text(form, "sector"),
      headcount: int(form, "headcount"),
      kind: text(form, "client_kind"),
      primary_contact_id: text(form, "primary_contact_id"),
    })
    .eq("id", clientId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Vous ne pouvez pas modifier cette entreprise." };
  revalidatePath(`/affaires/${dealId}`);
  return { ok: "Enregistré." };
}

export async function addContact(dealId: string, clientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient();
    await insertContact(supabase, clientId, dealId, contactFields(form, ""));
    revalidatePath(`/affaires/${dealId}`);
    return { ok: "Contact ajouté." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateContact(contactId: string, dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const c = contactFields(form, "");
  if (!c.last_name) return { error: "Le nom du contact est obligatoire." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts").update(c).eq("id", contactId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Vous ne pouvez pas modifier ce contact." };
  revalidatePath(`/affaires/${dealId}`);
  return { ok: "Enregistré." };
}

export async function linkContact(dealId: string, contactId: string) {
  const supabase = await createClient();
  await supabase.from("deal_contacts").upsert({ deal_id: dealId, contact_id: contactId });
  revalidatePath(`/affaires/${dealId}`);
}

export async function unlinkContact(dealId: string, contactId: string) {
  const supabase = await createClient();
  await supabase.from("deal_contacts").delete().eq("deal_id", dealId).eq("contact_id", contactId);
  revalidatePath(`/affaires/${dealId}`);
}

// Rendez-vous ---------------------------------------------------------------------------

/** Contact choisi dans la liste, ou créé à partir des champs « nouveau contact ». */
async function pickContact(supabase: Supabase, form: FormData, field: string, prefix: string, clientId: string, dealId: string): Promise<string | null> {
  const choice = text(form, field);
  if (choice && choice !== "nouveau") return choice;
  const c = contactFields(form, prefix);
  if (choice === "nouveau" || hasContactInput(c)) return insertContact(supabase, clientId, dealId, c);
  return null;
}

export async function bookAppointment(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: deal } = await supabase
      .from("deals")
      .select("id, name, client_id, country_code, stage, clients(name)")
      .eq("id", dealId)
      .single<{ id: string; name: string | null; client_id: string; country_code: string; stage: Stage; clients: { name: string } }>();
    if (!deal || !user) throw new Error("Affaire introuvable.");
    const repId = int(form, "sales_rep_id");
    if (!repId) throw new Error("Choisissez le commercial qui aura le rendez-vous.");
    const startsAt = text(form, "starts_at");
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) throw new Error("Indiquez la date et l'heure du rendez-vous.");
    const contactId = await pickContact(supabase, form, "contact_id", "rdv_", deal.client_id, dealId);
    if (!contactId) throw new Error("Choisissez la personne rencontrée ou créez un contact.");
    const minutes = int(form, "duration_minutes") ?? 60;
    const location = text(form, "location");
    const notes = text(form, "notes");

    const { data: appt, error } = await supabase
      .from("appointments")
      .insert({ deal_id: dealId, sales_rep_id: repId, contact_id: contactId, starts_at: new Date(startsAt).toISOString(), duration_minutes: minutes, location, notes, booked_by: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Rendez-vous pris par un SDR sur une affaire sans SDR : il en devient le SDR.
    const { data: booker } = await supabase.from("profiles").select("role").eq("id", user.id).single<{ role: string }>();
    if (booker?.role === "sdr") {
      const { data: mine } = await supabase.from("sales_reps").select("id").eq("profile_id", user.id).limit(1);
      if (mine?.[0]) await supabase.from("deals").update({ sdr_id: mine[0].id }).eq("id", dealId).is("sdr_id", null);
    }

    // Glissé vers « Prise de rendez-vous » depuis une autre étape que « À contacter » : on tente aussi le changement d'étape.
    if (deal.stage !== "prise_rdv" && deal.stage !== "a_contacter" && text(form, "move") === "1") {
      await supabase.from("deals").update({ stage: "prise_rdv" }).eq("id", dealId);
    }

    // Email au commercial et à celui qui a pris le rendez-vous, s'il est différent.
    const [{ data: rep }, { data: me }, { data: contact }] = await Promise.all([
      supabase.from("sales_reps").select("display_name, email, profiles(email)").eq("id", repId).single<{ display_name: string; email: string | null; profiles: { email: string } | null }>(),
      supabase.from("profiles").select("full_name, email").eq("id", user.id).single<{ full_name: string; email: string }>(),
      supabase.from("contacts").select("first_name, last_name, job_title, email, phone").eq("id", contactId).single(),
    ]);
    const repEmail = rep?.profiles?.email ?? rep?.email ?? null;
    const recipients = [repEmail, me?.email].filter((e): e is string => !!e);
    const title = dealTitle(deal, deal.clients.name);
    const when = formatDateTime(new Date(startsAt).toISOString(), deal.country_code);
    const who = contact ? [contactName(contact), contact.job_title].filter(Boolean).join(", ") : "";
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://crm-forecast-susu-73c6.vercel.app";
    const link = `${origin}/affaires/${dealId}`;
    const lines = [
      `Rendez-vous pour ${rep?.display_name ?? "le commercial"} : ${deal.clients.name}`,
      `Quand : ${when} (${minutes} min)`,
      location && `Où : ${location}`,
      who && `Avec : ${who}${contact?.phone ? ` · ${contact.phone}` : ""}${contact?.email ? ` · ${contact.email}` : ""}`,
      `Affaire : ${title}`,
      notes && `Notes : ${notes}`,
      `Pris par : ${me?.full_name ?? me?.email ?? ""}`,
      `Fiche de l'affaire : ${link}`,
    ].filter(Boolean) as string[];
    const event = { start: new Date(startsAt), minutes, title: `RDV ${deal.clients.name}${who ? ` avec ${who}` : ""}`, description: lines.join("\n"), location };
    let status = "non_configure";
    let message = "Rendez-vous enregistré.";
    if (!repEmail) {
      status = "erreur : le commercial n'a pas d'adresse email dans Cerise";
      message += " Email non envoyé : le commercial n'a pas d'adresse email (à compléter dans Utilisateurs).";
    } else if (emailConfigured()) {
      const html = `<div style="font-family:Arial,sans-serif;color:#14213d">${lines
        .map((l, i) => (i === 0 ? `<h2 style="margin:0 0 12px">${escapeHtml(l)}</h2>` : `<p style="margin:4px 0">${escapeHtml(l)}</p>`))
        .join("")}<p style="margin-top:16px"><a href="${escapeHtml(googleCalendarLink(event))}">Ajouter à Google Agenda</a> · <a href="${escapeHtml(link)}">Ouvrir l'affaire dans Cerise</a></p></div>`;
      const result = await sendMail({
        to: recipients,
        subject: `Rendez-vous ${deal.clients.name} · ${when}`,
        text: lines.join("\n"),
        html,
        ics: { filename: "rendez-vous.ics", content: calendarInvite({ uid: appt.id, ...event }) },
      });
      status = result.detail ? `${result.status} : ${result.detail}` : result.status;
      message += result.status === "envoye" ? ` Email envoyé à ${[...new Set(recipients)].join(" et ")}.` : ` L'email n'a pas pu partir (${result.detail}).`;
    } else {
      message += " Email non envoyé : le service d'envoi n'est pas encore configuré.";
    }
    await supabase.from("appointments").update({ email_status: status }).eq("id", appt.id);
    await supabase.from("activities").insert({
      deal_id: dealId,
      kind: "rdv",
      body: `Rendez-vous pris pour ${rep?.display_name ?? "?"} le ${when}${who ? ` avec ${who}` : ""}${location ? `, ${location}` : ""}.`,
      author_id: user.id,
    });
    revalidatePath(`/affaires/${dealId}`);
    revalidatePath("/affaires");
    return { ok: message };
  } catch (e) {
    return fail(e);
  }
}

export async function reportAppointment(dealId: string, appointmentId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: deal } = await supabase.from("deals").select("client_id, sales_rep_id, country_code").eq("id", dealId).single();
    if (!deal || !user) throw new Error("Affaire introuvable.");
    const contactId = await pickContact(supabase, form, "report_contact_id", "cr_", deal.client_id, dealId);
    if (!contactId) throw new Error("Indiquez avec qui le rendez-vous a eu lieu.");
    const report = {
      report_contact_id: contactId,
      report_decision_maker: yesNo(form, "report_decision_maker"),
      report_need: yesNo(form, "report_need"),
      report_budget: yesNo(form, "report_budget"),
      report_close_date: text(form, "report_close_date"),
      report_notes: text(form, "report_notes"),
      reported_at: new Date().toISOString(),
      reported_by: user.id,
    };
    if (report.report_decision_maker === null || report.report_need === null || report.report_budget === null) {
      throw new Error("Répondez aux trois questions : décideur, besoin et budget.");
    }

    let id = appointmentId;
    if (!id) {
      // Pas de rendez-vous enregistré dans Cerise : on le crée à la date indiquée, puis on y ajoute le compte rendu.
      const repId = int(form, "sales_rep_id") ?? deal.sales_rep_id;
      const day = text(form, "met_on");
      if (!repId) throw new Error("Choisissez le commercial qui a eu le rendez-vous.");
      if (!day) throw new Error("Indiquez la date du rendez-vous.");
      const { data, error } = await supabase
        .from("appointments")
        .insert({ deal_id: dealId, sales_rep_id: repId, contact_id: contactId, starts_at: new Date(`${day}T09:00:00Z`).toISOString(), booked_by: user.id, email_status: "sans email (saisi après coup)" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = data.id;
    }
    const { data, error } = await supabase.from("appointments").update(report).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Vous ne pouvez pas saisir le compte rendu de ce rendez-vous.");
    // Un compte rendu vaut rendez-vous effectué.
    await supabase.from("appointments").update({ done_at: report.reported_at, done_by: user.id }).eq("id", id).is("done_at", null);

    const yn = (b: boolean | null) => (b ? "oui" : "non");
    await supabase.from("activities").insert({
      deal_id: dealId,
      kind: "rdv",
      body: `Compte rendu : décideur ${yn(report.report_decision_maker)}, besoin ${yn(report.report_need)}, budget ${yn(report.report_budget)}${
        report.report_close_date ? `, closing potentiel ${report.report_close_date}` : ""
      }.${report.report_notes ? `\n${report.report_notes}` : ""}`,
      author_id: user.id,
    });

    let message = "Compte rendu enregistré.";
    if (text(form, "to_opportunity") === "1") {
      const { data: moved } = await supabase.from("deals").update({ stage: "opportunite" }).eq("id", dealId).select("id");
      message += moved?.length ? ` L'affaire est passée en ${STAGE_LABEL.opportunite}.` : " Seul le porteur de l'affaire ou un manager peut la passer en Opportunité.";
    }
    revalidatePath(`/affaires/${dealId}`);
    revalidatePath("/affaires");
    return { ok: message };
  } catch (e) {
    return fail(e);
  }
}

/** Rendez-vous marqué comme effectué, avec son résultat (obligatoire). */
export async function markAppointmentDone(dealId: string, appointmentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const outcome = text(form, "outcome");
    if (!outcome) throw new Error("Indiquez le résultat (outcome) du rendez-vous.");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expirée, reconnectez-vous.");
    const { data, error } = await supabase
      .from("appointments")
      .update({ done_at: new Date().toISOString(), done_by: user.id, outcome })
      .eq("id", appointmentId)
      .select("starts_at, sales_rep_id, sales_reps(display_name)")
      .returns<{ starts_at: string; sales_rep_id: number; sales_reps: { display_name: string } | null }[]>();
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Vous ne pouvez pas modifier ce rendez-vous (réservé au commercial concerné, à celui qui l'a pris et à ceux qui gèrent l'affaire).");
    await supabase.from("activities").insert({
      deal_id: dealId,
      kind: "rdv",
      body: `Rendez-vous effectué (${data[0].sales_reps?.display_name ?? "commercial"}, ${data[0].starts_at.slice(0, 10)}). Résultat : ${outcome}`,
      author_id: user.id,
    });
    revalidatePath(`/affaires/${dealId}`);
    return { ok: "Rendez-vous marqué comme effectué." };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelAppointment(dealId: string, appointmentId: string) {
  const supabase = await createClient();
  await supabase.from("appointments").delete().eq("id", appointmentId);
  revalidatePath(`/affaires/${dealId}`);
}

// Historique et encaissements ------------------------------------------------------------

export async function addActivity(dealId: string, form: FormData) {
  const supabase = await createClient();
  const body = text(form, "body");
  if (!body) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("activities").insert({
    deal_id: dealId,
    kind: text(form, "kind") ?? "note",
    body,
    happened_on: text(form, "happened_on") ?? new Date().toISOString().slice(0, 10),
    author_id: user!.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${dealId}`);
}

export async function addPayment(dealId: string, form: FormData) {
  const supabase = await createClient();
  const amount = int(form, "amount");
  const paidOn = text(form, "paid_on");
  if (!amount || !paidOn) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("payments").insert({ deal_id: dealId, amount, paid_on: paidOn, created_by: user!.id });
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${dealId}`);
}

export async function deletePayment(dealId: string, paymentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/affaires/${dealId}`);
}
