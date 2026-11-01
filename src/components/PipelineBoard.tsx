"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CARDS_STATUS, formatDate, STAGE_ACCENT, STAGES, type CardsStatus, type Contact, type Stage } from "@/lib/domain";
import { formatM } from "@/lib/reports";
import { getBookingData, moveDeal } from "@/app/(app)/affaires/actions";
import { BookingForm } from "./BookingForm";

export type BoardCard = {
  id: string;
  title: string;
  client: string;
  amount: number;
  stage: Stage;
  rep: string | null;
  close: string | null;
  country: string;
  late: boolean;
  cards: CardsStatus | null;
};

type Dialog =
  | { kind: "rdv"; card: BoardCard; data: { contacts: Contact[]; reps: { id: number; display_name: string }[]; defaultRep: number | null } | null }
  | { kind: "cartes"; card: BoardCard };

const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Pipe commercial en vignettes : une colonne par étape, glisser-déposer pour changer d'étape. */
export function PipelineBoard({ cards: initial, stages }: { cards: BoardCard[]; stages?: Stage[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [message, setMessage] = useState<{ text: string; href?: string; ok?: boolean } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [, startTransition] = useTransition();
  const columns = STAGES.filter((s) => !stages?.length || stages.includes(s.value));

  function move(card: BoardCard, stage: Stage, cards?: CardsStatus) {
    setMessage(null);
    const previous = card.stage;
    // « CR de rendez-vous » ouvre la fiche sur son formulaire ; les autres étapes changent tout de suite.
    if (stage !== "cr_rdv") setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage, cards: cards ?? c.cards } : c)));
    startTransition(async () => {
      const result: { error?: string; redirectTo?: string } = await moveDeal(card.id, stage, cards).catch(() => ({
        error: "la modification n'a pas pu être enregistrée, réessayez.",
      }));
      if (result.error) {
        setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage: previous } : c)));
        setMessage({ text: `« ${card.title} » : ${result.error}`, href: result.redirectTo });
      } else if (result.redirectTo) {
        router.push(result.redirectTo);
      } else {
        router.refresh();
      }
    });
  }

  function drop(stage: Stage) {
    setOver(null);
    const card = cards.find((c) => c.id === dragging);
    setDragging(null);
    if (!card || card.stage === stage) return;
    if (stage === "prise_rdv") {
      // Le formulaire de rendez-vous s'ouvre ici même ; l'affaire change d'étape une fois le rendez-vous réservé.
      setDialog({ kind: "rdv", card, data: null });
      getBookingData(card.id)
        .then((data) => {
          if (!data) throw new Error();
          setDialog((d) => (d?.kind === "rdv" && d.card.id === card.id ? { ...d, data } : d));
        })
        .catch(() => {
          setDialog(null);
          setMessage({ text: `« ${card.title} » : le formulaire de rendez-vous n'a pas pu s'ouvrir.`, href: `/affaires/${card.id}?action=rdv#rdv` });
        });
      return;
    }
    if (stage === "won_pending") {
      setDialog({ kind: "cartes", card });
      return;
    }
    move(card, stage);
  }

  return (
    <div className="space-y-2">
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => setDialog(null)}>
          <div className="mt-10 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{dialog.kind === "rdv" ? "Prise de rendez-vous" : "Passage en Won Pending"}</h2>
                <p className="text-sm text-zinc-500">
                  {dialog.card.title}
                  {dialog.card.title !== dialog.card.client && ` · ${dialog.card.client}`}
                </p>
              </div>
              <button onClick={() => setDialog(null)} className="text-zinc-500 hover:text-zinc-800" aria-label="Fermer">
                ✕
              </button>
            </div>
            {dialog.kind === "rdv" ? (
              dialog.data ? (
                <BookingForm
                  dealId={dialog.card.id}
                  contacts={dialog.data.contacts}
                  reps={dialog.data.reps}
                  defaultRep={dialog.data.defaultRep}
                  move
                  onSuccess={(text) => {
                    const id = dialog.card.id;
                    setDialog(null);
                    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: "prise_rdv" } : c)));
                    setMessage({ text, ok: true });
                    router.refresh();
                  }}
                />
              ) : (
                <p className="py-6 text-center text-sm text-zinc-500">Chargement…</p>
              )
            ) : (
              <div className="space-y-3">
                <p className="text-sm">Les cartes ont-elles été livrées ?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CARDS_STATUS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => {
                        const card = dialog.card;
                        setDialog(null);
                        move(card, "won_pending", c.value);
                      }}
                      className={`rounded-lg border px-3 py-3 text-sm font-semibold hover:border-brand-blue hover:bg-blue-50 ${
                        dialog.card.cards === c.value ? "border-brand-blue bg-blue-50" : "border-zinc-300"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500">
                  Cartes livrées et moins de la moitié du montant encaissée : le porteur reçoit un rappel par email chaque lundi.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {message && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
            message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <span>{message.text}</span>
          {message.href && (
            <Link href={message.href} className="font-semibold underline">
              Ouvrir la fiche
            </Link>
          )}
          <button onClick={() => setMessage(null)} className="ml-auto" aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex gap-3">
          {columns.map((col) => {
            const list = cards.filter((c) => c.stage === col.value);
            const total = list.reduce((s, c) => s + c.amount, 0);
            return (
              <section
                key={col.value}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(col.value);
                }}
                onDragLeave={() => setOver((o) => (o === col.value ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(col.value);
                }}
                className={`flex w-64 shrink-0 flex-col rounded-xl border bg-zinc-50 transition-colors ${
                  over === col.value ? "border-brand-blue bg-blue-50" : "border-zinc-200"
                }`}
              >
                <header className="rounded-t-xl border-t-4 bg-white px-3 py-2" style={{ borderTopColor: STAGE_ACCENT[col.value] }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-bold" title={col.help}>
                      {col.label}
                    </h2>
                    <span className="text-xs text-zinc-500">{list.length}</span>
                  </div>
                  <div className="text-xs text-zinc-500">{formatM(total)} XOF</div>
                </header>
                <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                  {list.map((c) => (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        setDragging(c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 text-sm shadow-sm hover:border-brand-blue active:cursor-grabbing ${
                        dragging === c.id ? "opacity-40" : ""
                      }`}
                    >
                      <Link href={`/affaires/${c.id}`} className="block font-semibold leading-snug hover:underline" draggable={false}>
                        {c.title}
                      </Link>
                      {c.title !== c.client && <div className="truncate text-xs text-zinc-600">{c.client}</div>}
                      <div className="mt-1.5 font-semibold tabular-nums">{money.format(c.amount)} XOF</div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs text-zinc-500">
                        <span className="truncate">
                          {c.rep ?? <span className="text-red-600">Sans porteur</span>} · {c.country}
                        </span>
                        {c.close && <span className={c.late ? "text-red-700" : ""}>{formatDate(c.close)}</span>}
                      </div>
                    </article>
                  ))}
                  {list.length === 0 && <p className="px-1 py-4 text-center text-xs text-zinc-400">Déposez une affaire ici</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Glissez une vignette d&apos;une colonne à l&apos;autre pour changer l&apos;étape. Vers « Prise de rendez-vous », le formulaire de rendez-vous
        s&apos;ouvre ; vers « Won Pending », on vous demande si les cartes sont livrées ; vers « CR de rendez-vous », la fiche de l&apos;affaire s&apos;ouvre
        sur le compte rendu.
      </p>
    </div>
  );
}
