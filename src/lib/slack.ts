// Messages Slack de Cerise : rendez-vous pris (message privé aux personnes concernées) et affaires gagnées
// (Won Pending puis Won) annoncées dans un canal. Tout passe par une app Slack dont le jeton est dans Vercel :
// - SLACK_BOT_TOKEN : jeton « xoxb-… » de l'app (droits chat:write, chat:write.public, users:read, users:read.email) ;
// - SLACK_WINS_CHANNEL : canal des affaires gagnées (par défaut #performance-b2c-to-b2b).
// Sans jeton, rien n'est envoyé et l'application fonctionne comme avant. Une erreur Slack ne bloque jamais l'action.

export type SlackResult = { status: "envoye" | "non_configure" | "erreur"; detail?: string };

const DEFAULT_WINS_CHANNEL = "#performance-b2c-to-b2b";

export const slackConfigured = () => Boolean(process.env.SLACK_BOT_TOKEN);

async function slackApi(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: new URLSearchParams(Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return res.json();
}

/** Compte Slack correspondant à une adresse email (même adresse que dans Cerise). */
export async function slackUserId(email: string | null | undefined): Promise<string | null> {
  if (!email || !slackConfigured()) return null;
  try {
    const r = await slackApi("users.lookupByEmail", { email: email.trim().toLowerCase() });
    return r.ok ? ((r.user as { id: string }).id ?? null) : null;
  } catch {
    return null;
  }
}

export async function postSlack(channel: string, text: string): Promise<SlackResult> {
  if (!slackConfigured()) return { status: "non_configure" };
  try {
    const r = await slackApi("chat.postMessage", { channel, text, unfurl_links: "false" });
    return r.ok ? { status: "envoye" } : { status: "erreur", detail: r.error };
  } catch (e) {
    return { status: "erreur", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Message privé à chaque adresse (doublons retirés). Renvoie les adresses jointes et celles sans compte Slack. */
export async function directMessages(emails: (string | null | undefined)[], text: string): Promise<{ sent: string[]; missing: string[]; error?: string }> {
  const list = [...new Set(emails.map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e))];
  const sent: string[] = [];
  const missing: string[] = [];
  let error: string | undefined;
  if (!slackConfigured()) return { sent, missing };
  for (const email of list) {
    const id = await slackUserId(email);
    if (!id) {
      missing.push(email);
      continue;
    }
    const r = await postSlack(id, text);
    if (r.status === "envoye") sent.push(email);
    else error = r.detail;
  }
  return { sent, missing, error };
}

export const winsChannel = () => process.env.SLACK_WINS_CHANNEL?.trim() || DEFAULT_WINS_CHANNEL;

// Textes des messages -------------------------------------------------------------------

/** Échappe les caractères spéciaux de Slack (&, <, >). */
export const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const person = (name: string | null | undefined, slackId: string | null | undefined) => (slackId ? `<@${slackId}>` : `*${slackEscape(name || "?")}*`);

export type WinInfo = {
  stage: "won_pending" | "won";
  title: string;
  client: string;
  country: string | null;
  businessLine: string | null;
  amount: string;
  beneficiaries: number | null;
  rep: { name: string | null; slackId?: string | null };
  sdr?: { name: string | null; slackId?: string | null } | null;
  saleChannel?: string | null;
  expectedPayment?: string | null;
  collected?: string | null;
  link: string;
};

export function winMessage(w: WinInfo): string {
  const head =
    w.stage === "won_pending"
      ? `:tada: *Nouvelle affaire gagnée (Won Pending)* par ${person(w.rep.name, w.rep.slackId)} !`
      : `:white_check_mark: *Affaire encaissée (Won)* : bravo ${person(w.rep.name, w.rep.slackId)}, l'encaissement est à présent complet.`;
  const lines = [
    head,
    `• Client : *${slackEscape(w.client)}*${w.title !== w.client ? ` · ${slackEscape(w.title)}` : ""}`,
    `• Montant : *${w.amount}*${w.beneficiaries ? ` · ${w.beneficiaries} bénéficiaires` : ""}`,
    (w.businessLine || w.country) && `• ${[w.businessLine && `LoB : ${slackEscape(w.businessLine)}`, w.country && `Pays : ${slackEscape(w.country)}`].filter(Boolean).join(" · ")}`,
    w.sdr?.name && `• SDR : ${person(w.sdr.name, w.sdr.slackId)}`,
    w.saleChannel && `• Type de vente : ${slackEscape(w.saleChannel)}`,
    w.stage === "won_pending" && w.expectedPayment && `• Encaissement prévu le ${w.expectedPayment}`,
    w.stage === "won" && w.collected && `• Encaissé : *${w.collected}*`,
    `<${w.link}|Ouvrir l'affaire dans Cerise>`,
  ];
  return lines.filter(Boolean).join("\n");
}

export type MeetingInfo = {
  client: string;
  title: string;
  rep: string;
  when: string;
  minutes: number;
  location: string | null;
  who: string;
  notes: string | null;
  bookedBy: string;
  link: string;
};

export function meetingMessage(m: MeetingInfo): string {
  return [
    `:calendar: *Rendez-vous pris* pour *${slackEscape(m.rep)}* chez *${slackEscape(m.client)}*`,
    `• Quand : ${m.when} (${m.minutes} min)`,
    m.location && `• Où : ${slackEscape(m.location)}`,
    m.who && `• Avec : ${slackEscape(m.who)}`,
    m.title !== m.client && `• Affaire : ${slackEscape(m.title)}`,
    m.notes && `• Notes : ${slackEscape(m.notes)}`,
    `• Pris par : ${slackEscape(m.bookedBy)}`,
    `<${m.link}|Ouvrir l'affaire dans Cerise>`,
  ]
    .filter(Boolean)
    .join("\n");
}
