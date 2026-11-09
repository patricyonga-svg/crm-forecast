// Ordre du pipe, de la gauche vers la droite.
export const STAGES = [
  { value: "a_contacter", label: "À contacter", help: "Prospect identifié : entreprise, secteur et au moins un contact" },
  { value: "prise_rdv", label: "Prise de rendez-vous", help: "Rendez-vous réservé pour un commercial" },
  { value: "cr_rdv", label: "CR de rendez-vous", help: "Rendez-vous fait : décideur, besoin, budget et échéance renseignés" },
  { value: "opportunite", label: "Opportunité", help: "Devis envoyé, retour non négatif, closing dans les 6 mois" },
  { value: "forecast", label: "Forecast", help: "Devis validé, date de closing connue" },
  { value: "won_pending", label: "Won Pending", help: "Facturé, pas encore encaissé" },
  { value: "won", label: "Won", help: "Facturé et encaissé" },
  { value: "a_relancer", label: "À relancer", help: "Pas de retour du client, relance nécessaire" },
  { value: "perdu", label: "Perdu", help: "Affaire perdue ou abandonnée, hors pipe" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

/** Étapes de prospection, avant que l'affaire devienne une opportunité (lead qualifié). Hors pipe dans les rapports. */
export const LEAD_STAGES: Stage[] = ["a_contacter", "prise_rdv", "cr_rdv"];

export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<Stage, string>;

export const STAGE_COLOR: Record<Stage, string> = {
  a_contacter: "bg-sky-50 text-sky-800",
  prise_rdv: "bg-violet-100 text-violet-800",
  cr_rdv: "bg-fuchsia-100 text-fuchsia-800",
  opportunite: "bg-zinc-100 text-zinc-700",
  a_relancer: "bg-orange-100 text-orange-800",
  forecast: "bg-blue-100 text-blue-800",
  won_pending: "bg-amber-100 text-amber-800",
  won: "bg-emerald-100 text-emerald-800",
  perdu: "bg-red-50 text-red-700 line-through",
};

/** Couleur du liseré des colonnes du pipe. */
export const STAGE_ACCENT: Record<Stage, string> = {
  a_contacter: "#7cc4ea",
  prise_rdv: "#8b6fd6",
  cr_rdv: "#c06bc9",
  opportunite: "#9aa3b5",
  forecast: "#2a78d6",
  won_pending: "#f2b134",
  won: "#1baf7a",
  a_relancer: "#eb6834",
  perdu: "#d64545",
};

export const isStage = (v: unknown): v is Stage => STAGES.some((s) => s.value === v);

/** Fuseau horaire de chaque pays, pour afficher l'heure des rendez-vous. */
export const COUNTRY_TZ: Record<string, string> = { SN: "Africa/Dakar", CI: "Africa/Abidjan", CM: "Africa/Douala" };

export function formatDateTime(iso: string, country?: string | null): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: COUNTRY_TZ[country ?? ""] ?? "Africa/Dakar",
  });
}

export type Contact = {
  id: string;
  client_id: string;
  last_name: string;
  first_name: string | null;
  job_title: string | null;
  is_decision_maker: boolean | null;
  email: string | null;
  phone: string | null;
  comment: string | null;
};

export const contactName = (c: Pick<Contact, "first_name" | "last_name">) => [c.first_name, c.last_name].filter(Boolean).join(" ");

export type Client = {
  id: string;
  name: string;
  country_code: string;
  kind: string | null;
  sector: string | null;
  headcount: number | null;
  primary_contact_id: string | null;
};

export type Appointment = {
  id: string;
  deal_id: string;
  sales_rep_id: number;
  contact_id: string | null;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  booked_by: string | null;
  email_status: string | null;
  report_contact_id: string | null;
  report_decision_maker: boolean | null;
  report_need: boolean | null;
  report_budget: boolean | null;
  report_close_date: string | null;
  report_notes: string | null;
  reported_at: string | null;
  done_at: string | null;
  outcome: string | null;
};

/** Rendez-vous effectué : marqué comme tel, ou avec un compte rendu. */
export const appointmentDone = (a: Pick<Appointment, "done_at" | "reported_at">) => !!(a.done_at || a.reported_at);

/** Livraison des cartes : à renseigner pour passer en Won Pending. */
export const CARDS_STATUS = [
  { value: "livrees", label: "Livrée(s)" },
  { value: "non_livrees", label: "Non livrée(s)" },
  { value: "desactivees", label: "Désactivée(s)" },
] as const;

export type CardsStatus = (typeof CARDS_STATUS)[number]["value"];

export const isCardsStatus = (v: unknown): v is CardsStatus => CARDS_STATUS.some((c) => c.value === v);

/** Rappel d'encaissement : cartes livrées et moins de la moitié du montant encaissée. */
export const needsCollectionReminder = (d: { stage: string; cards_status: string | null; quote_amount: number; collected_amount: number }) =>
  d.stage === "won_pending" && d.cards_status === "livrees" && Number(d.collected_amount) < Number(d.quote_amount) / 2;

/** Étapes pour lesquelles un devis joint est obligatoire au moment d'y passer. */
export const QUOTE_REQUIRED_STAGES: Stage[] = ["forecast", "won_pending", "won"];

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * « Encaissement en retard » (Won Pending) : la date prévisionnelle d'encaissement est dépassée,
 * ou, sans date prévisionnelle, le closing date de plus de 30 jours.
 */
export function lateCollection(
  d: { stage: string; expected_close_date: string | null; expected_payment_date: string | null },
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (d.stage !== "won_pending") return false;
  if (d.expected_payment_date) return d.expected_payment_date < today;
  return !!d.expected_close_date && d.expected_close_date < addDays(today, -30);
}

/** Secteurs proposés (saisie libre possible). */
export const SECTORS = [
  "Agriculture et agro-industrie",
  "Assurance",
  "Banque et finance",
  "BTP et immobilier",
  "Commerce et distribution",
  "Éducation",
  "Énergie et mines",
  "Hôtellerie et restauration",
  "Industrie",
  "Institution publique",
  "ONG et organisation internationale",
  "Santé",
  "Services aux entreprises",
  "Télécoms et numérique",
  "Transport et logistique",
];

export type Deal = {
  id: string;
  name: string | null;
  comment: string | null;
  cards_status: CardsStatus | null;
  sdr_id: number | null;
  quote_file_path: string | null;
  quote_file_name: string | null;
  expected_payment_date: string | null;
  qualified_at: string | null;
  created_at: string;
  client_id: string;
  country_code: string;
  business_line_id: number | null;
  sales_rep_id: number | null;
  beneficiaries: number | null;
  quote_amount: number;
  stage: Stage;
  expected_close_date: string | null;
  closing_raw: string | null;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
  forecast_amount: number;
  invoiced_amount: number;
  collected_amount: number;
  quarter_label: string | null;
};

export const ROLES = [
  { value: "commercial", label: "Commercial - AE", help: "voit les affaires de son pays et modifie les siennes" },
  { value: "sdr", label: "Commercial - SDR", help: "mêmes droits qu'un commercial AE, avec en plus des objectifs de prospection (nouveaux leads, leads qualifiés)" },
  { value: "manager", label: "Manager", help: "modifie toutes les affaires de son pays et ses objectifs" },
  { value: "direction", label: "Direction", help: "voit tous les pays, sans modifier" },
  { value: "admin", label: "Administrateur", help: "peut tout faire, y compris gérer les utilisateurs" },
] as const;

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  country_code: string | null;
  role: (typeof ROLES)[number]["value"];
};

const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatMoney(value: number | null | undefined, currency = "XOF"): string {
  return `${money.format(Number(value ?? 0))} ${currency}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function percent(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)} %` : "—";
}

/** Premier et dernier jour d'un trimestre civil, « 2026-T4 ». */
export function quarterRange(value: string): { from: string; to: string; months: string[] } {
  const [y, q] = value.split("-T").map(Number);
  const start = (q - 1) * 3 + 1;
  const months = [0, 1, 2].map((i) => `${y}-${String(start + i).padStart(2, "0")}-01`);
  const lastDay = new Date(Date.UTC(y, start + 2, 0)).getUTCDate();
  return { from: months[0], to: `${y}-${String(start + 2).padStart(2, "0")}-${lastDay}`, months };
}

export function currentQuarter(today = new Date()): string {
  return `${today.getFullYear()}-T${Math.floor(today.getMonth() / 3) + 1}`;
}

/** Nom affiché d'une affaire : son nom, sinon celui du client (affaires importées du Sheet). */
export const dealTitle = (d: { name?: string | null }, clientName?: string | null) => d.name?.trim() || clientName || "Affaire sans nom";
