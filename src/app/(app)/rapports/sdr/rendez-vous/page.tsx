import Link from "next/link";
import { countByPeriod, day, isDone, lastPeriods, type Granularity } from "@/lib/sdr";
import { byCountry, loadAppointments, sdrReps } from "../data";
import { CountTable } from "./CountTable";

const GRANULARITIES: { value: Granularity; label: string; count: number }[] = [
  { value: "semaine", label: "Semaine", count: 8 },
  { value: "mois", label: "Mois", count: 6 },
  { value: "trimestre", label: "Trimestre", count: 4 },
];

/** Statistiques des rendez-vous : pris par chaque SDR, et effectués par chaque commercial AE. */
export default async function AppointmentStatsPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const { periode } = await searchParams;
  const g = GRANULARITIES.find((x) => x.value === periode) ?? GRANULARITIES[0];
  const periods = lastPeriods(g.value, g.count);
  const { refs, appointments } = await loadAppointments(periods[0].from);

  // Pris par : le compte qui a réservé le rendez-vous, rapporté à son nom de commercial.
  const repByProfile = new Map(refs.reps.filter((r) => r.profile_id).map((r) => [r.profile_id as string, r.id]));
  const bookedBy = (a: (typeof appointments)[number]) => (a.booked_by ? repByProfile.get(a.booked_by) ?? null : null);
  const sdrs = sdrReps(refs.reps, []);
  const sdrRows = sdrs.map((r) => ({ ...r, counts: countByPeriod(appointments.filter((a) => bookedBy(a) === r.id), (a) => day(a.created_at), periods) }));
  const otherBookings = countByPeriod(
    appointments.filter((a) => {
      const id = bookedBy(a);
      return id === null || !sdrs.some((s) => s.id === id);
    }),
    (a) => day(a.created_at),
    periods,
  );

  const done = appointments.filter(isDone);
  const aeIds = new Set(done.map((a) => a.sales_rep_id));
  const aeRows = refs.reps
    .filter((r) => aeIds.has(r.id) || (!r.is_sdr && r.active !== false && r.profile_id))
    .map((r) => ({
      ...r,
      counts: countByPeriod(done.filter((a) => a.sales_rep_id === r.id), (a) => day(a.starts_at), periods),
      planned: countByPeriod(appointments.filter((a) => a.sales_rep_id === r.id && !isDone(a)), (a) => day(a.starts_at), periods),
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Rendez-vous · {g.count} dernières périodes</p>
          <h1 className="text-2xl font-extrabold">
            {sdrRows.reduce((s, r) => s + r.counts[r.counts.length - 1], 0)} rendez-vous pris par les SDR et{" "}
            {aeRows.reduce((s, r) => s + r.counts[r.counts.length - 1], 0)} effectués par les AE {g.value === "semaine" ? "cette semaine" : g.value === "mois" ? "ce mois-ci" : "ce trimestre"}
          </h1>
        </div>
        <div className="flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm">
          {GRANULARITIES.map((x) => (
            <Link key={x.value} href={`?periode=${x.value}`} className={`px-3 py-2 ${x.value === g.value ? "bg-[#14213d] text-white" : "hover:bg-zinc-50"}`}>
              {x.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Rendez-vous pris par SDR</h2>
          <p className="text-sm text-zinc-600">Rendez-vous réservés dans Cerise par chaque SDR, comptés à la date de réservation.</p>
        </div>
        {sdrRows.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun SDR pour l&apos;instant (rôle « Commercial - SDR » à donner dans Utilisateurs).</p>
        ) : (
          <CountTable
            periods={periods}
            groups={byCountry(refs.countries, sdrRows).map((c) => ({ ...c, rows: c.items.map((r) => ({ key: r.id, name: r.display_name, counts: r.counts })) }))}
            footer={{ name: "Pris par d'autres (AE, managers…)", counts: otherBookings }}
          />
        )}
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Rendez-vous effectués par AE</h2>
          <p className="text-sm text-zinc-600">
            Rendez-vous marqués comme effectués (ou avec un compte rendu), comptés à la date du rendez-vous. En gris : rendez-vous prévus non encore marqués.
          </p>
        </div>
        <CountTable
          periods={periods}
          groups={byCountry(refs.countries, aeRows).map((c) => ({
            ...c,
            rows: c.items.map((r) => ({ key: r.id, name: r.display_name, counts: r.counts, extra: r.planned })),
          }))}
        />
      </section>
    </div>
  );
}
