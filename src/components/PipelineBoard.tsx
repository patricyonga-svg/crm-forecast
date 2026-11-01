"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate, STAGE_ACCENT, STAGES, type Stage } from "@/lib/domain";
import { formatM } from "@/lib/reports";
import { moveDeal } from "@/app/(app)/affaires/actions";

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
};

const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Pipe commercial en vignettes : une colonne par étape, glisser-déposer pour changer d'étape. */
export function PipelineBoard({ cards: initial, stages }: { cards: BoardCard[]; stages?: Stage[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [message, setMessage] = useState<{ text: string; href?: string } | null>(null);
  const [, startTransition] = useTransition();
  const columns = STAGES.filter((s) => !stages?.length || stages.includes(s.value));

  function drop(stage: Stage) {
    setOver(null);
    const card = cards.find((c) => c.id === dragging);
    setDragging(null);
    if (!card || card.stage === stage) return;
    setMessage(null);
    const previous = card.stage;
    // Les étapes à formulaire (rendez-vous, compte rendu) ouvrent la fiche ; les autres changent tout de suite.
    const withForm = stage === "prise_rdv" || stage === "cr_rdv";
    if (!withForm) setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage } : c)));
    startTransition(async () => {
      const result: { error?: string; redirectTo?: string } = await moveDeal(card.id, stage).catch(() => ({
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

  return (
    <div className="space-y-2">
      {message && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{message.text}</span>
          {message.href && (
            <Link href={message.href} className="font-semibold underline">
              Ouvrir la fiche
            </Link>
          )}
          <button onClick={() => setMessage(null)} className="ml-auto text-red-700" aria-label="Fermer">
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
        Glissez une vignette d&apos;une colonne à l&apos;autre pour changer l&apos;étape. Vers « Prise de rendez-vous » ou « CR de rendez-vous », la fiche de
        l&apos;affaire s&apos;ouvre sur le formulaire correspondant.
      </p>
    </div>
  );
}
