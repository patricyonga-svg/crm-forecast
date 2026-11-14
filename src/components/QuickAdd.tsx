"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addContact, getBookingData } from "@/app/(app)/affaires/actions";
import type { Stage } from "@/lib/domain";
import { ActionForm } from "./ActionForm";
import { BookingForm } from "./BookingForm";
import { ContactFields } from "./ContactFields";
import { StageBadge } from "./StageBadge";

export type QuickDeal = { id: string; clientId: string; title: string; client: string; country: string; stage: Stage };
type Kind = "rdv" | "contact";
type Booking = NonNullable<Awaited<ReturnType<typeof getBookingData>>>;

const CHOICES: { kind: Kind | "affaire"; title: string; help: string; href?: string }[] = [
  { kind: "affaire", title: "Nouvelle affaire ou prospect", help: "Entreprise, contact et affaire en une fois.", href: "/affaires/nouvelle" },
  { kind: "rdv", title: "Rendez-vous", help: "Pour vous ou un commercial, sur une affaire existante." },
  { kind: "contact", title: "Contact", help: "Ajouter une personne à une affaire existante." },
];

/** Écran « Ajouter » du téléphone : choisir quoi ajouter, puis l'affaire concernée, puis remplir le formulaire. */
export function QuickAdd({ deals, initial }: { deals: QuickDeal[]; initial: Kind | null }) {
  const [kind, setKind] = useState<Kind | null>(initial);
  const [deal, setDeal] = useState<QuickDeal | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, startLoading] = useTransition();

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? deals.filter((d) => d.title.toLowerCase().includes(needle) || d.client.toLowerCase().includes(needle)) : deals;
    return list.slice(0, 30);
  }, [deals, q]);

  function pick(d: QuickDeal) {
    setDeal(d);
    setDone(null);
    setBooking(null);
    if (kind === "rdv") startLoading(async () => setBooking(await getBookingData(d.id)));
  }
  function reset() {
    setKind(null);
    setDeal(null);
    setBooking(null);
    setDone(null);
    setQ("");
  }

  if (!kind)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">Ajouter</h1>
        <ul className="space-y-2">
          {CHOICES.map((c) => (
            <li key={c.kind}>
              {c.href ? (
                <Link href={c.href} className="card flex items-center justify-between gap-3 active:bg-zinc-50">
                  <ChoiceText title={c.title} help={c.help} />
                </Link>
              ) : (
                <button type="button" onClick={() => setKind(c.kind as Kind)} className="card flex w-full items-center justify-between gap-3 text-left active:bg-zinc-50">
                  <ChoiceText title={c.title} help={c.help} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  const label = kind === "rdv" ? "Prendre un rendez-vous" : "Ajouter un contact";
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={deal ? () => setDeal(null) : reset} className="text-sm text-zinc-600 hover:underline">
          ← Retour
        </button>
      </div>
      <h1 className="text-xl font-semibold">{label}</h1>

      {!deal ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-600">Pour quelle affaire ?</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom du client ou de l'affaire…"
              className="input"
              autoFocus
            />
          </label>
          <ul className="card divide-y divide-zinc-100 p-0">
            {matches.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => pick(d)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-zinc-50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.title}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {d.title !== d.client ? `${d.client} · ` : ""}
                      {d.country}
                    </span>
                  </span>
                  <StageBadge stage={d.stage} />
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-zinc-500">
                Aucune affaire trouvée.{" "}
                <Link href="/affaires/nouvelle" className="font-semibold text-brand-blue">
                  Créer une affaire
                </Link>
              </li>
            )}
          </ul>
          {deals.length > matches.length && !q && <p className="text-xs text-zinc-500">Affaires modifiées récemment ; tapez un nom pour chercher les autres.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card flex items-center justify-between gap-3 bg-blue-50/50 p-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{deal.title}</span>
              <span className="block truncate text-xs text-zinc-500">
                {deal.client} · {deal.country}
              </span>
            </span>
            <button type="button" onClick={() => setDeal(null)} className="shrink-0 text-sm font-semibold text-brand-blue">
              Changer
            </button>
          </div>

          {done && (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
              {done}{" "}
              <Link href={`/affaires/${deal.id}`} className="font-semibold underline">
                Ouvrir l&apos;affaire
              </Link>
            </div>
          )}

          <div className="card">
            {kind === "rdv" ? (
              loading || !booking ? (
                <p className="text-sm text-zinc-500">{loading ? "Chargement des contacts…" : "Affaire introuvable ou non modifiable."}</p>
              ) : (
                <BookingForm key={deal.id} dealId={deal.id} contacts={booking.contacts} reps={booking.reps} defaultRep={booking.defaultRep} onSuccess={setDone} />
              )
            ) : (
              <ActionForm key={deal.id} action={addContact.bind(null, deal.id, deal.clientId)} className="space-y-3" submitLabel="Ajouter le contact" resetOnSuccess onSuccess={setDone}>
                <ContactFields />
              </ActionForm>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceText({ title, help }: { title: string; help: string }) {
  return (
    <>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-zinc-500">{help}</span>
      </span>
      <span aria-hidden className="text-xl text-zinc-400">
        ›
      </span>
    </>
  );
}
