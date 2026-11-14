import Link from "next/link";
import { getReferences, getSession } from "@/lib/session";
import { ActionForm } from "@/components/ActionForm";
import { COUNTRY_TZ, appointmentDone, contactName, dealTitle, type Appointment, type Contact } from "@/lib/domain";
import { markAppointmentDone } from "../affaires/actions";

type Row = Appointment & {
  deals: { id: string; name: string | null; country_code: string; clients: { name: string } | null } | null;
  contacts: Pick<Contact, "first_name" | "last_name" | "phone" | "email" | "job_title"> | null;
  sales_reps: { display_name: string } | null;
};

const DAY = 86_400_000;

/** Lundi 00:00 (UTC) de la semaine décalée de `offset` semaines par rapport à la semaine en cours. */
function weekStart(offset: number): Date {
  const now = new Date();
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ((now.getUTCDay() + 6) % 7) * DAY;
  return new Date(monday + offset * 7 * DAY);
}

const tz = (country?: string | null) => COUNTRY_TZ[country ?? ""] ?? "Africa/Dakar";
const dayKey = (iso: string, country?: string | null) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz(country) });
const time = (iso: string, country?: string | null) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz(country) });
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDay = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** Agenda des rendez-vous de la semaine : les miens (commercial ou pris par moi) ou ceux de toute l'équipe visible. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semaine?: string; qui?: string }> }) {
  const params = await searchParams;
  const offset = Math.max(-52, Math.min(52, Number.parseInt(params.semaine ?? "0", 10) || 0));
  const { supabase, user } = await getSession();
  const refs = await getReferences(supabase);
  const myReps = refs.reps.filter((r) => r.profile_id === user.id).map((r) => r.id);
  const team = params.qui === "equipe" || (params.qui !== "moi" && myReps.length === 0);

  const from = weekStart(offset);
  const to = new Date(from.getTime() + 7 * DAY);
  let query = supabase
    .from("appointments")
    .select("*, deals(id, name, country_code, clients(name)), contacts!contact_id(first_name, last_name, phone, email, job_title), sales_reps(display_name)")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");
  if (!team) query = query.or([`booked_by.eq.${user.id}`, ...(myReps.length ? [`sales_rep_id.in.(${myReps.join(",")})`] : [])].join(","));
  const { data, error } = await query.returns<Row[]>();
  const appointments = data ?? [];

  const today = dayKey(new Date().toISOString());
  const days = new Map<string, Row[]>();
  if (offset === 0) days.set(today, []);
  for (const a of appointments) {
    const key = dayKey(a.starts_at, a.deals?.country_code);
    days.set(key, [...(days.get(key) ?? []), a]);
  }
  const sortedDays = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const now = Date.now();
  const link = (changes: { semaine?: number; qui?: string }) => {
    const q = new URLSearchParams();
    const s = changes.semaine ?? offset;
    if (s) q.set("semaine", String(s));
    q.set("qui", changes.qui ?? (team ? "equipe" : "moi"));
    return `/agenda?${q}`;
  };
  const todo = appointments.filter((a) => !appointmentDone(a) && new Date(a.starts_at).getTime() < now).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-3">
        <div>
          <p className="eyebrow">
            Semaine du {shortDay(from)} au {shortDay(new Date(to.getTime() - DAY))}
          </p>
          <h1 className="text-2xl font-extrabold">
            {appointments.length} rendez-vous {team ? "dans l'équipe" : "pour moi"}
          </h1>
          {todo > 0 && (
            <p className="text-sm text-amber-800">
              {todo} rendez-vous passé{todo > 1 ? "s" : ""} à marquer comme effectué{todo > 1 ? "s" : ""}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm font-semibold">
            <Link href={link({ qui: "moi" })} className={`px-3 py-2 ${team ? "hover:bg-zinc-50" : "bg-brand-navy text-white"}`}>
              Les miens
            </Link>
            <Link href={link({ qui: "equipe" })} className={`border-l border-zinc-300 px-3 py-2 ${team ? "bg-brand-navy text-white" : "hover:bg-zinc-50"}`}>
              Équipe
            </Link>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm font-semibold">
            <Link href={link({ semaine: offset - 1 })} className="px-3 py-2 hover:bg-zinc-50" aria-label="Semaine précédente">
              ←
            </Link>
            <Link href={link({ semaine: 0 })} className={`border-x border-zinc-300 px-3 py-2 ${offset === 0 ? "text-zinc-400" : "hover:bg-zinc-50"}`}>
              Cette semaine
            </Link>
            <Link href={link({ semaine: offset + 1 })} className="px-3 py-2 hover:bg-zinc-50" aria-label="Semaine suivante">
              →
            </Link>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">Erreur de chargement : {error.message}</p>}

      {sortedDays.length === 0 && (
        <div className="card py-8 text-center text-sm text-zinc-500">
          <p>Aucun rendez-vous cette semaine.</p>
          <Link href="/ajouter?type=rdv" className="btn mt-3">
            Prendre un rendez-vous
          </Link>
        </div>
      )}

      {sortedDays.map(([key, items]) => (
        <section key={key} className="space-y-2">
          <h2 className={`text-sm font-bold first-letter:uppercase ${key === today ? "text-brand-blue" : "text-zinc-500"}`}>
            {key === today ? `Aujourd'hui · ${dayLabel(key)}` : dayLabel(key)}
          </h2>
          {items.length === 0 && <p className="card p-3 text-sm text-zinc-500">Pas de rendez-vous aujourd&apos;hui.</p>}
          <ul className="space-y-2">
            {items.map((a) => {
              const country = a.deals?.country_code;
              const done = appointmentDone(a);
              const past = new Date(a.starts_at).getTime() < now;
              const title = a.deals ? dealTitle(a.deals, a.deals.clients?.name ?? "") : "Affaire";
              return (
                <li key={a.id} className="card space-y-2 p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-14 shrink-0">
                      <div className="text-lg font-bold tabular-nums leading-tight">{time(a.starts_at, country)}</div>
                      <div className="text-xs text-zinc-500">{a.duration_minutes} min</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/affaires/${a.deal_id}#rdv`} className="block truncate font-semibold hover:underline">
                        {title}
                      </Link>
                      {a.deals?.name && a.deals.clients && a.deals.name !== a.deals.clients.name && (
                        <div className="truncate text-xs text-zinc-500">{a.deals.clients.name}</div>
                      )}
                      {a.contacts && (
                        <div className="text-sm">
                          {contactName(a.contacts)}
                          {a.contacts.job_title && <span className="text-zinc-500"> · {a.contacts.job_title}</span>}
                        </div>
                      )}
                      {a.location && (
                        <a
                          href={isUrl(a.location) ? a.location : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.location)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm text-brand-blue hover:underline"
                        >
                          {isUrl(a.location) ? "Rejoindre la visio" : a.location}
                        </a>
                      )}
                      {team && <div className="text-xs text-zinc-500">{a.sales_reps?.display_name ?? "?"}</div>}
                    </div>
                    {done ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Effectué</span>
                    ) : past ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">À marquer</span>
                    ) : null}
                  </div>
                  {a.notes && <p className="whitespace-pre-line rounded-md bg-zinc-50 p-2 text-sm text-zinc-700">{a.notes}</p>}
                  <div className="flex flex-wrap gap-2 empty:hidden">
                    {a.contacts?.phone && (
                      <a href={`tel:${a.contacts.phone}`} className="btn-secondary px-3 py-1.5">
                        Appeler
                      </a>
                    )}
                    {a.contacts?.email && (
                      <a href={`mailto:${a.contacts.email}`} className="btn-secondary px-3 py-1.5">
                        Email
                      </a>
                    )}
                    {!a.reported_at && (past || done) && (
                      <Link href={`/affaires/${a.deal_id}?action=cr#cr`} className="btn-secondary px-3 py-1.5">
                        Compte rendu
                      </Link>
                    )}
                  </div>
                  {!done && past && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Marquer comme effectué</summary>
                      <ActionForm action={markAppointmentDone.bind(null, a.deal_id, a.id)} className="mt-2 space-y-2" submitLabel="Marquer comme effectué">
                        <textarea
                          name="outcome"
                          required
                          rows={3}
                          className="input"
                          placeholder="Résultat du rendez-vous : ce qui a été décidé, prochaine étape…"
                          aria-label="Résultat du rendez-vous"
                        />
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
