import Link from "next/link";
import { Avatar, CountryBadge } from "@/components/charts";
import { countByPeriod, day, isDone, lastPeriods, type Granularity, type Period } from "@/lib/sdr";
import { byCountry, loadAppointments, sdrReps } from "../data";

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

type Row = { key: number; name: string; counts: number[]; extra?: number[] };

function CountTable({ periods, groups, footer }: { periods: Period[]; groups: { code: string; name: string; rows: Row[] }[]; footer?: { name: string; counts: number[] } }) {
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm tabular-nums">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-200">
            <th className="py-1.5 pr-3 text-left font-medium">Commercial</th>
            {periods.map((p, i) => (
              <th key={p.key} className={`px-2 py-1.5 text-right font-medium capitalize ${i === periods.length - 1 ? "text-zinc-900" : ""}`} title={`${p.from} → ${p.to}`}>
                {p.label}
              </th>
            ))}
            <th className="py-1.5 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.code}>
            <tr>
              <td colSpan={periods.length + 2} className="pb-1 pt-3">
                <span className="flex items-center gap-2 font-bold">
                  <CountryBadge code={g.code} />
                  {g.name}
                </span>
              </td>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.key} className="border-b border-zinc-100">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-2 font-medium">
                    <Avatar name={r.name} size="sm" />
                    {r.name}
                  </span>
                </td>
                {r.counts.map((n, i) => (
                  <td key={periods[i].key} className={`px-2 py-1.5 text-right ${i === periods.length - 1 ? "bg-blue-50/50 font-bold" : ""} ${n ? "" : "text-zinc-300"}`}>
                    {n}
                    {!!r.extra?.[i] && <span className="ml-1 text-xs font-normal text-zinc-400">+{r.extra[i]}</span>}
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right font-semibold">{sum(r.counts)}</td>
              </tr>
            ))}
            <tr className="bg-zinc-50 font-bold">
              <td className="py-1.5 pl-2 pr-3">Total {g.name}</td>
              {periods.map((p, i) => (
                <td key={p.key} className="px-2 py-1.5 text-right">
                  {g.rows.reduce((s, r) => s + r.counts[i], 0)}
                </td>
              ))}
              <td className="py-1.5 pl-3 text-right">{g.rows.reduce((s, r) => s + sum(r.counts), 0)}</td>
            </tr>
          </tbody>
        ))}
        {footer && sum(footer.counts) > 0 && (
          <tfoot>
            <tr className="text-zinc-500">
              <td className="py-2 pr-3 italic">{footer.name}</td>
              {footer.counts.map((n, i) => (
                <td key={periods[i].key} className="px-2 py-2 text-right">
                  {n}
                </td>
              ))}
              <td className="py-2 pl-3 text-right">{sum(footer.counts)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
