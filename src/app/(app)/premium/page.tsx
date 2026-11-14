import Link from "next/link";
import { getReferences, getSession } from "@/lib/session";
import { currentQuarter, formatDate, LEAD_STAGES, quarterRange, STAGES, type Stage } from "@/lib/domain";
import { formatM, inQuarter, previousQuarter, realised, type ReportDeal } from "@/lib/reports";
import { account, byPriority, HEALTH_LABEL, isOpen, type Account, type Health, type PremiumDeal } from "@/lib/premium";
import { Avatar, Kpi } from "@/components/charts";
import { StageBadge } from "@/components/StageBadge";
import { SummarySwitch } from "@/components/SummarySwitch";

type Search = { trimestre?: string; pays?: string; porteur?: string };

const DOT: Record<Health, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-600", idle: "bg-zinc-300" };
const DEAL_COLUMNS =
  "id, client_id, name, stage, country_code, sales_rep_id, quote_amount, forecast_amount, invoiced_amount, collected_amount, expected_close_date, expected_payment_date, next_action, next_action_date, created_at";

function ago(date: string | null, today: string): string {
  if (!date) return "jamais";
  const n = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  return n <= 0 ? "aujourd'hui" : n === 1 ? "hier" : `il y a ${n} j`;
}

export default async function PremiumPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase } = await getSession();
  const refs = await getReferences(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const trimestre = /^\d{4}-T[1-4]$/.test(params.trimestre ?? "") ? params.trimestre! : currentQuarter();
  const { from, to } = quarterRange(trimestre);
  const pays = params.pays || undefined;
  const porteur = params.porteur ? Number(params.porteur) : undefined;

  const [{ data: clientRows }, { data: dealRows }, { data: teamRows }] = await Promise.all([
    supabase.from("clients").select("id, name, country_code").eq("is_premium", true).order("name"),
    supabase.from("deal_amounts").select(`${DEAL_COLUMNS}, clients!inner(is_premium)`).eq("clients.is_premium", true).returns<PremiumDeal[]>(),
    // Toutes les affaires du trimestre (et les retards du précédent), pour situer le poids des Premium.
    supabase
      .from("deal_amounts")
      .select("country_code, sales_rep_id, stage, expected_close_date, quote_amount, forecast_amount, invoiced_amount")
      .gte("expected_close_date", quarterRange(previousQuarter(trimestre)).from)
      .lte("expected_close_date", to)
      .returns<ReportDeal[]>(),
  ]);

  const keep = (d: { country_code: string; sales_rep_id: number | null }) => (!pays || d.country_code === pays) && (!porteur || d.sales_rep_id === porteur);
  const deals = (dealRows ?? []).filter(keep);
  const team = (teamRows ?? []).filter(keep);
  const filtered = !!(pays || porteur);

  // Dernier contact par affaire : notes et appels saisis, rendez-vous passés.
  const ids = deals.map((d) => d.id);
  const [{ data: acts }, { data: appts }] = ids.length
    ? await Promise.all([
        supabase.from("activities").select("deal_id, happened_on").in("deal_id", ids).lte("happened_on", today),
        supabase.from("appointments").select("deal_id, starts_at").in("deal_id", ids).lte("starts_at", new Date().toISOString()),
      ])
    : [{ data: [] }, { data: [] }];
  const clientOf = new Map(deals.map((d) => [d.id, d.client_id]));
  const lastContact = new Map<string, string>();
  for (const [dealId, date] of [
    ...(acts ?? []).map((a) => [a.deal_id as string, a.happened_on as string] as const),
    ...(appts ?? []).map((a) => [a.deal_id as string, (a.starts_at as string).slice(0, 10)] as const),
  ]) {
    const c = clientOf.get(dealId);
    if (c && (lastContact.get(c) ?? "") < date) lastContact.set(c, date);
  }

  const accounts: Account[] = (clientRows ?? [])
    .filter((c) => !pays || c.country_code === pays || deals.some((d) => d.client_id === c.id))
    .map((c) => account(c, deals.filter((d) => d.client_id === c.id), lastContact.get(c.id) ?? null, today))
    .filter((a) => !filtered || a.deals.length > 0)
    .sort(byPriority);

  // Indicateurs du trimestre, mêmes règles que le rapport AE (prospection et perdus hors pipe).
  const scope = <T extends ReportDeal>(ds: T[]) => ds.filter((d) => d.stage !== "perdu" && !LEAD_STAGES.includes(d.stage) && inQuarter(d, trimestre));
  const sum = <T,>(ds: T[], pick: (d: T) => number) => ds.reduce((s, d) => s + Number(pick(d)), 0);
  const premiumScoped = scope(deals);
  const k = {
    pipe: sum(premiumScoped, (d) => d.quote_amount),
    forecast: sum(premiumScoped, (d) => d.forecast_amount),
    done: realised(deals, from, to),
    collected: sum(
      deals.filter((d) => d.expected_close_date && d.expected_close_date >= from && d.expected_close_date <= to),
      (d) => d.collected_amount,
    ),
    teamPipe: sum(scope(team), (d) => d.quote_amount),
    teamForecast: sum(scope(team), (d) => d.forecast_amount),
    teamDone: realised(team, from, to),
  };
  const share = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} % de l'équipe` : "—");
  const watch = accounts.filter((a) => a.health === "bad" || a.health === "warn");

  const openDeals = deals.filter(isOpen);
  const actions = openDeals
    .filter((d) => d.next_action || d.next_action_date)
    .sort((a, b) => (a.next_action_date ?? "9999").localeCompare(b.next_action_date ?? "9999"))
    .slice(0, 8);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const repName = new Map(refs.reps.map((r) => [r.id, r.display_name]));
  const stages = STAGES.filter((s) => s.value !== "perdu")
    .map((s) => {
      const ds = deals.filter((d) => d.stage === s.value);
      return { stage: s.value as Stage, count: ds.length, amount: sum(ds, (d) => d.quote_amount) };
    })
    .filter((s) => s.count > 0);

  const year = Number(trimestre.slice(0, 4));
  const quarters = [year - 1, year, year + 1].flatMap((y) => [1, 2, 3, 4].map((q) => `${y}-T${q}`));
  const pipeLink = `/affaires?premium=oui&mode=pipe${pays ? `&pays=${pays}` : ""}${porteur ? `&porteur=${porteur}` : ""}`;

  return (
    <div className="space-y-6">
      <SummarySwitch />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Suivi séparé · {trimestre.replace("-", " ")}</p>
          <h1 className="text-2xl font-extrabold">
            <span className="text-amber-500">★</span> Comptes Premium
          </h1>
          <p className="text-sm text-zinc-500">
            {accounts.length} client{accounts.length > 1 ? "s" : ""} · {openDeals.length} affaire{openDeals.length > 1 ? "s" : ""} en cours
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap gap-2">
            <select name="trimestre" defaultValue={trimestre} className="input w-auto" aria-label="Trimestre">
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {q.replace("-", " ")}
                </option>
              ))}
            </select>
            <select name="pays" defaultValue={pays ?? ""} className="input w-auto" aria-label="Pays">
              <option value="">Tous les pays</option>
              {refs.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name="porteur" defaultValue={porteur ?? ""} className="input w-auto" aria-label="Commercial">
              <option value="">Tous les commerciaux</option>
              {refs.reps
                .filter((r) => r.active !== false)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name}
                  </option>
                ))}
            </select>
            <button className="btn-secondary">Afficher</button>
          </form>
          <Link href={pipeLink} className="btn-secondary hidden md:inline-flex">
            Voir le pipe Premium
          </Link>
        </div>
      </div>

      {(clientRows ?? []).length === 0 ? (
        <div className="card space-y-2 py-10 text-center text-sm text-zinc-600">
          <p className="text-base font-semibold text-zinc-900">Aucun client Premium pour l&apos;instant.</p>
          <p>
            Un administrateur ou un manager ouvre une affaire du client, puis active « ★ Client Premium » dans le bloc Entreprise.
            <br />
            Toutes les affaires du client apparaissent alors ici.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Pipe Premium" value={formatM(k.pipe)} sub={share(k.pipe, k.teamPipe)} />
            <Kpi label="Forecast du trimestre" value={formatM(k.forecast)} sub={share(k.forecast, k.teamForecast)} />
            <Kpi label="Facturé du trimestre" value={formatM(k.done)} sub={share(k.done, k.teamDone)} />
            <Kpi label="Encaissé" value={formatM(k.collected)} sub={k.done > 0 ? `${Math.round((k.collected / k.done) * 100)} % du facturé` : "—"} />
            <Kpi
              label="À surveiller"
              value={watch.length}
              valueClass={watch.length ? "text-red-700" : "text-emerald-700"}
              sub={`compte${watch.length > 1 ? "s" : ""} sur ${accounts.length}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <section className="card space-y-3 p-0 pt-4">
              <div className="flex items-baseline justify-between px-4">
                <h2 className="font-semibold">Comptes Premium</h2>
                <span className="flex flex-wrap gap-3 text-xs text-zinc-500">
                  {(["ok", "warn", "bad"] as Health[]).map((h) => (
                    <span key={h} className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${DOT[h]}`} />
                      {HEALTH_LABEL[h]}
                    </span>
                  ))}
                </span>
              </div>
              {/* Ordinateur : tableau. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-y border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2">Client</th>
                      <th className="px-2 py-2">Porteurs</th>
                      <th className="px-2 py-2 text-right">Pipe</th>
                      <th className="px-2 py-2 text-right">Forecast</th>
                      <th className="px-2 py-2 text-right">Facturé</th>
                      <th className="px-2 py-2">Dernier contact</th>
                      <th className="px-4 py-2">Prochaine action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <AccountRow key={a.id} a={a} today={today} repName={repName} />
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Téléphone : fiches. */}
              <ul className="space-y-2 px-3 pb-3 md:hidden">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/affaires?premium=oui&q=${encodeURIComponent(a.name)}`}
                      className="block rounded-lg border border-amber-300 border-l-4 border-l-amber-400 bg-white p-3 active:bg-zinc-50"
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[a.health]}`} title={HEALTH_LABEL[a.health]} />
                        <span className="truncate">{a.name}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2 text-xs text-zinc-500">
                        <span>
                          Pipe {formatM(a.pipe)} · {a.open.length} affaire{a.open.length > 1 ? "s" : ""}
                        </span>
                        <span className={a.issues.length ? "font-semibold text-red-700" : ""}>
                          {a.issues[0] ?? (a.next?.date ? formatDate(a.next.date) : "")}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <div className="space-y-4">
              <section className="card space-y-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">Prochaines actions Premium</h2>
                  <Link href="/agenda" className="text-xs font-semibold text-brand-blue hover:underline">
                    Agenda
                  </Link>
                </div>
                {actions.length === 0 && <p className="text-sm text-zinc-500">Aucune action prévue sur les affaires Premium.</p>}
                <ul className="divide-y divide-zinc-100 text-sm">
                  {actions.map((d) => {
                    const late = !!d.next_action_date && d.next_action_date < today;
                    return (
                      <li key={d.id} className="flex gap-3 py-2">
                        <span className={`w-16 shrink-0 text-xs ${late ? "font-semibold text-red-700" : "text-zinc-500"}`}>
                          {d.next_action_date ? formatDate(d.next_action_date).replace(/ \d{4}$/, "") : "—"}
                        </span>
                        <Link href={`/affaires/${d.id}`} className="min-w-0 hover:underline">
                          <span className="font-semibold">{names.get(d.client_id)}</span> · {d.next_action ?? "Action prévue"}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <section className="card space-y-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">Affaires Premium par étape</h2>
                  <Link href={pipeLink} className="text-xs font-semibold text-brand-blue hover:underline">
                    Pipe
                  </Link>
                </div>
                <table className="w-full text-sm tabular-nums">
                  <tbody>
                    {stages.map((s) => (
                      <tr key={s.stage} className="border-b border-zinc-100 last:border-0">
                        <td className="py-1.5">
                          <StageBadge stage={s.stage} />
                        </td>
                        <td className="py-1.5 text-right">{s.count}</td>
                        <td className="py-1.5 text-right font-semibold">{formatM(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Les affaires Premium restent comptées dans le pipe et les rapports de l&apos;équipe. Pipe et forecast suivent les règles du rapport AE (trimestre
            choisi, prospection et affaires perdues exclues). Rouge : affaires en cours sans action prévue ou sans contact depuis plus de 30 jours. Orange :
            action en retard, closing dépassé ou encaissement en retard.
          </p>
        </>
      )}
    </div>
  );
}

function AccountRow({ a, today, repName }: { a: Account; today: string; repName: Map<number, string> }) {
  const reps = [...new Set(a.deals.map((d) => d.sales_rep_id).filter((id): id is number => id !== null))];
  return (
    <tr className="border-b border-zinc-100 align-top hover:bg-zinc-50">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[a.health]}`} title={HEALTH_LABEL[a.health]} />
          <Link href={`/affaires?premium=oui&mode=liste&q=${encodeURIComponent(a.name)}`} className="font-semibold hover:underline">
            {a.name}
          </Link>
        </div>
        <div className="pl-[18px] text-xs text-zinc-500">
          {a.country} · {a.open.length} affaire{a.open.length > 1 ? "s" : ""} en cours
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="flex -space-x-1">
          {reps.slice(0, 3).map((id) => (
            <Avatar key={id} name={repName.get(id) ?? "?"} size="sm" />
          ))}
          {reps.length === 0 && <span className="text-xs text-red-600">—</span>}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{a.pipe ? formatM(a.pipe) : "—"}</td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{a.forecast ? formatM(a.forecast) : "—"}</td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{a.invoiced ? formatM(a.invoiced) : "—"}</td>
      <td className="whitespace-nowrap px-2 py-2.5 text-zinc-600">{ago(a.lastContact, today)}</td>
      <td className="px-4 py-2.5">
        {a.next && (
          <Link href={`/affaires/${a.next.dealId}`} className={`block hover:underline ${a.next.date && a.next.date < today ? "text-red-700" : ""}`}>
            {a.next.text}
            {a.next.date && <span className="text-zinc-500"> · {formatDate(a.next.date).replace(/ \d{4}$/, "")}</span>}
          </Link>
        )}
        {a.issues.length > 0 && <div className="text-xs font-semibold text-red-700">{a.issues.join(" · ")}</div>}
        {!a.next && a.issues.length === 0 && <span className="text-zinc-400">—</span>}
      </td>
    </tr>
  );
}
