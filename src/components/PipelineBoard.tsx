"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CARDS_STATUS, formatDate, LEAD_STAGES, STAGE_ACCENT, STAGES, type CardsStatus, type Contact, type Stage } from "@/lib/domain";
import { formatM, initials } from "@/lib/reports";
import { getBookingData, moveDeal, type MoveExtra } from "@/app/(app)/affaires/actions";
import { BookingForm } from "./BookingForm";
import { LateCollectionPill } from "./charts";
import { QuoteUpload } from "./QuoteUpload";

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
  hasQuote: boolean;
  paymentDate: string | null;
  lateCollection: boolean;
};

type Dialog =
  | { kind: "rdv"; card: BoardCard; data: { contacts: Contact[]; reps: { id: number; display_name: string }[]; defaultRep: number | null } | null }
  | { kind: "vente"; card: BoardCard; stage: "forecast" | "won_pending" | "won" };

/** Étapes rangées dans des zones étroites à droite du pipe, dépliables au clic. */
const TRAY_STAGES: Stage[] = ["a_relancer", "perdu"];
const DAY = 86_400_000;
const lateDays = (close: string) => Math.max(1, Math.round((Date.now() - new Date(`${close}T00:00:00`).getTime()) / DAY));

/** Pipe commercial en vignettes : une colonne par étape, glisser-déposer pour changer d'étape. */
export function PipelineBoard({ cards: initial, stages }: { cards: BoardCard[]; stages?: Stage[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [message, setMessage] = useState<{ text: string; href?: string; ok?: boolean } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [, startTransition] = useTransition();
  // Prospection regroupée en une colonne et étapes « À relancer » / « Perdu » en zones étroites, sauf si on les déplie
  // ou si un filtre d'étape est actif (on montre alors exactement les étapes choisies).
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [openTrays, setOpenTrays] = useState<Stage[]>([]);
  const filtered = !!stages?.length;
  const columns = STAGES.filter((s) => !filtered || stages!.includes(s.value));
  const groupLeads = !filtered && !leadsOpen;

  function move(card: BoardCard, stage: Stage, extra: MoveExtra = {}) {
    setMessage(null);
    const previous = card.stage;
    // « CR de rendez-vous » ouvre la fiche sur son formulaire ; les autres étapes changent tout de suite.
    if (stage !== "cr_rdv")
      setCards((cs) =>
        cs.map((c) =>
          c.id === card.id
            ? {
                ...c,
                stage,
                cards: (extra.cards as CardsStatus | undefined) ?? c.cards,
                hasQuote: c.hasQuote || !!extra.quotePath,
                paymentDate: extra.paymentDate ?? c.paymentDate,
              }
            : c,
        ),
      );
    startTransition(async () => {
      const result: { error?: string; redirectTo?: string } = await moveDeal(card.id, stage, extra).catch(() => ({
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
    // Won Pending demande toujours cartes et date d'encaissement ; Forecast et Won, le devis s'il manque.
    if (stage === "won_pending" || ((stage === "forecast" || stage === "won") && !card.hasQuote)) {
      setDialog({ kind: "vente", card, stage });
      return;
    }
    move(card, stage);
  }

  const cardProps = {
    dragging,
    onCardDragStart: (id: string) => setDragging(id),
    onCardDragEnd: () => setDragging(null),
  };

  return (
    <div className="space-y-2">
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => setDialog(null)}>
          <div className="mt-10 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{dialog.kind === "rdv" ? "Prise de rendez-vous" : `Passage en ${STAGES.find((s) => s.value === dialog.stage)?.label}`}</h2>
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
              <SalesDialog
                card={dialog.card}
                stage={dialog.stage}
                onConfirm={(extra) => {
                  const { card, stage } = dialog;
                  setDialog(null);
                  move(card, stage, extra);
                }}
              />
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
        <div className="flex gap-2.5">
          {groupLeads && (
            <Column
              title="Prospection"
              help="À contacter, prise de rendez-vous et CR de rendez-vous"
              accent={STAGE_ACCENT.a_contacter}
              cards={cards.filter((c) => LEAD_STAGES.includes(c.stage))}
              showStage
              over={over === "a_contacter"}
              onDragOver={() => {
                // Déplie la prospection pendant un glisser pour choisir l'étape exacte.
                if (dragging) setLeadsOpen(true);
              }}
              onDrop={() => undefined}
              action={
                <button type="button" onClick={() => setLeadsOpen(true)} className="text-xs font-semibold text-brand-blue hover:underline">
                  Détailler
                </button>
              }
              {...cardProps}
            />
          )}
          {columns
            .filter((col) => !(groupLeads && LEAD_STAGES.includes(col.value)))
            .filter((col) => filtered || !TRAY_STAGES.includes(col.value) || openTrays.includes(col.value))
            .map((col) => (
              <Column
                key={col.value}
                title={col.label}
                help={col.help}
                accent={STAGE_ACCENT[col.value]}
                cards={cards.filter((c) => c.stage === col.value)}
                over={over === col.value}
                onDragOver={() => setOver(col.value)}
                onDragLeave={() => setOver((o) => (o === col.value ? null : o))}
                onDrop={() => drop(col.value)}
                action={
                  !filtered && LEAD_STAGES[0] === col.value ? (
                    <button type="button" onClick={() => setLeadsOpen(false)} className="text-xs font-semibold text-brand-blue hover:underline">
                      Regrouper
                    </button>
                  ) : !filtered && TRAY_STAGES.includes(col.value) ? (
                    <button type="button" onClick={() => setOpenTrays((t) => t.filter((x) => x !== col.value))} className="text-xs font-semibold text-brand-blue hover:underline">
                      Replier
                    </button>
                  ) : undefined
                }
                {...cardProps}
              />
            ))}
          {!filtered && TRAY_STAGES.some((t) => !openTrays.includes(t)) && (
            <div className="flex w-28 shrink-0 flex-col gap-2.5">
              {TRAY_STAGES.filter((t) => !openTrays.includes(t)).map((t) => {
                const list = cards.filter((c) => c.stage === t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOpenTrays((o) => [...o, t])}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(t);
                    }}
                    onDragLeave={() => setOver((o) => (o === t ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      drop(t);
                    }}
                    title={`${STAGES.find((s) => s.value === t)?.help}. Cliquez pour afficher les affaires, ou déposez une vignette ici.`}
                    className={`rounded-xl border-2 border-dashed px-2 py-4 text-center text-xs transition-colors ${
                      over === t ? "border-brand-blue bg-blue-50" : "border-zinc-300 text-zinc-500 hover:border-zinc-400"
                    }`}
                  >
                    <div className="font-semibold text-zinc-700">{STAGES.find((s) => s.value === t)?.label}</div>
                    <div className="mt-1 text-lg font-bold text-zinc-800">{list.length}</div>
                    <div>{formatM(list.reduce((sum, c) => sum + c.amount, 0))}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Glissez une vignette d&apos;une colonne à l&apos;autre pour changer l&apos;étape. La colonne « Prospection » se déplie en trois étapes pendant le
        glisser ; « À relancer » et « Perdu » sont les zones à droite. Vers « Prise de rendez-vous », le formulaire de rendez-vous
        s&apos;ouvre ; vers « Forecast » et « Won », on vous demande le devis s&apos;il manque ; vers « Won
        Pending », le devis, la livraison des cartes et la date prévisionnelle d&apos;encaissement ; vers « CR de rendez-vous », la fiche de l&apos;affaire s&apos;ouvre
        sur le compte rendu.
      </p>
    </div>
  );
}

const STAGE_SHORT: Partial<Record<Stage, string>> = { a_contacter: "À contacter", prise_rdv: "Prise de RDV", cr_rdv: "CR de RDV" };

function Column({
  title,
  help,
  accent,
  cards,
  over,
  showStage,
  action,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
}: {
  title: string;
  help?: string;
  accent: string;
  cards: BoardCard[];
  over: boolean;
  showStage?: boolean;
  action?: React.ReactNode;
  dragging: string | null;
  onDragOver: () => void;
  onDragLeave?: () => void;
  onDrop: () => void;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
}) {
  const total = cards.reduce((s, c) => s + c.amount, 0);
  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`flex min-w-44 flex-1 basis-0 flex-col rounded-xl border bg-zinc-50 transition-colors ${over ? "border-brand-blue bg-blue-50" : "border-zinc-200"}`}
    >
      <header className="rounded-t-xl border-t-4 bg-white px-3 py-2" style={{ borderTopColor: accent }}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold" title={help}>
            {title}
          </h2>
          <span className="rounded-full bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-600">{cards.length}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-600 tabular-nums">{formatM(total)} XOF</span>
          {action}
        </div>
      </header>
      <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
        {cards.map((c) => (
          <article
            key={c.id}
            draggable
            onDragStart={(e) => {
              onCardDragStart(c.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={onCardDragEnd}
            className={`cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 text-sm shadow-sm hover:border-brand-blue active:cursor-grabbing ${
              c.late ? "border-l-4 border-l-red-500" : ""
            } ${dragging === c.id ? "opacity-40" : ""}`}
          >
            {showStage && STAGE_SHORT[c.stage] && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{STAGE_SHORT[c.stage]}</div>}
            <Link href={`/affaires/${c.id}`} className="block font-semibold leading-snug hover:underline" draggable={false}>
              {c.title}
            </Link>
            {c.title !== c.client && <div className="truncate text-xs text-zinc-600">{c.client}</div>}
            {c.lateCollection && (
              <div className="mt-1">
                <LateCollectionPill
                  title={c.paymentDate ? `Encaissement prévu le ${formatDate(c.paymentDate)}, date dépassée` : "Closing de plus de 30 jours, sans date prévisionnelle d'encaissement"}
                />
              </div>
            )}
            <div className="mt-1 text-base font-bold tabular-nums">{formatM(c.amount)}</div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-zinc-500">
              <span className="flex min-w-0 items-center gap-1.5">
                {c.rep ? (
                  <span title={c.rep} className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#dfe6f3] text-[9px] font-bold text-[#14213d]">
                    {initials(c.rep)}
                  </span>
                ) : (
                  <span className="text-red-600">Sans porteur</span>
                )}
                <span>{c.country}</span>
              </span>
              {c.close &&
                (c.late ? (
                  <span className="font-semibold text-red-700" title={`Closing prévu le ${formatDate(c.close)}`}>
                    {lateDays(c.close)} j de retard
                  </span>
                ) : (
                  <span>{formatDate(c.close)}</span>
                ))}
            </div>
          </article>
        ))}
        {cards.length === 0 && <p className="px-1 py-4 text-center text-xs text-zinc-400">Déposez une affaire ici</p>}
      </div>
    </section>
  );
}

/** Ce qu'il faut renseigner pour passer en Forecast, Won Pending ou Won depuis le pipe. */
function SalesDialog({ card, stage, onConfirm }: { card: BoardCard; stage: "forecast" | "won_pending" | "won"; onConfirm: (extra: MoveExtra) => void }) {
  const [cards, setCardsStatus] = useState<CardsStatus | null>(card.cards);
  const [paymentDate, setPaymentDate] = useState(card.paymentDate ?? "");
  const [quote, setQuote] = useState<{ path: string; name: string } | null>(null);
  const pending = stage === "won_pending";
  const needQuote = !card.hasQuote && !quote;
  const ready = !needQuote && (!pending || (cards && paymentDate));
  return (
    <div className="space-y-4">
      {!card.hasQuote && (
        <div className="rounded-lg border border-zinc-200 p-3">
          <QuoteUpload dealId={card.id} required label="Devis de l'affaire" onUploaded={setQuote} />
        </div>
      )}
      {pending && (
        <>
          <div className="space-y-2">
            <p className="text-sm">Les cartes ont-elles été livrées ? *</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CARDS_STATUS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCardsStatus(c.value)}
                  className={`rounded-lg border px-3 py-3 text-sm font-semibold hover:border-brand-blue hover:bg-blue-50 ${cards === c.value ? "border-brand-blue bg-blue-50" : "border-zinc-300"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">Cartes livrées et moins de la moitié du montant encaissée : le porteur reçoit un rappel par email chaque lundi.</p>
          </div>
          <label className="block space-y-1 text-sm sm:w-1/2">
            <span className="text-zinc-600">Date prévisionnelle d&apos;encaissement *</span>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="input" />
          </label>
        </>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => onConfirm({ cards: cards ?? undefined, paymentDate: paymentDate || undefined, quotePath: quote?.path, quoteName: quote?.name })}
        className="btn"
      >
        Passer en {STAGES.find((s) => s.value === stage)?.label}
      </button>
    </div>
  );
}
