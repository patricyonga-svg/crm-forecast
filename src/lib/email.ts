// Envoi des emails de Cerise (rendez-vous). Deux services possibles, selon les variables renseignées dans Vercel :
// - Resend (RESEND_API_KEY) : service d'envoi en ligne, demande de valider le domaine de l'expéditeur ;
// - un compte email classique en SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD), par exemple Gmail avec un mot de passe d'application.
import nodemailer from "nodemailer";

export type Mail = {
  to: string[];
  subject: string;
  text: string;
  html: string;
  ics?: { filename: string; content: string };
};

export type MailResult = { status: "envoye" | "non_configure" | "erreur"; detail?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD));
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const to = [...new Set(mail.to.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return { status: "erreur", detail: "aucune adresse email" };
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: from || "Cerise <onboarding@resend.dev>",
          to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          attachments: mail.ics ? [{ filename: mail.ics.filename, content: Buffer.from(mail.ics.content).toString("base64") }] : undefined,
        }),
      });
      if (!res.ok) return { status: "erreur", detail: `Resend ${res.status} : ${(await res.text()).slice(0, 200)}` };
      return { status: "envoye" };
    }
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      await transport.sendMail({
        from: from.includes("<") ? from : `Cerise <${from}>`,
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        icalEvent: mail.ics ? { filename: mail.ics.filename, method: "PUBLISH", content: mail.ics.content } : undefined,
      });
      return { status: "envoye" };
    }
    return { status: "non_configure" };
  } catch (e) {
    return { status: "erreur", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

/** Invitation au format agenda (.ics), reconnue par Google Agenda et Outlook. */
export function calendarInvite(e: { uid: string; start: Date; minutes: number; title: string; description: string; location?: string | null }): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SUSU//Cerise//FR",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@cerise`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Lien « Ajouter à Google Agenda ». */
export function googleCalendarLink(e: { start: Date; minutes: number; title: string; description: string; location?: string | null }): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.start)}/${icsDate(end)}`, details: e.description });
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p}`;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
