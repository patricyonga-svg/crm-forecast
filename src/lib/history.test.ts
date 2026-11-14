import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cohortStats,
  collectionMonths,
  dueDate,
  pipeCohort,
  pipeMoves,
  stageSince,
  stateAt,
  timeline,
  toEvent,
  weeklyPoints,
  wonAt,
  type AuditRow,
  type DealState,
} from "./history";
import type { Stage } from "./domain";

const row = (id: string, at: string, action: string, stage: Stage | null, amount = 10, rep = 1): AuditRow => ({
  row_id: id,
  action,
  at,
  stage,
  quote_amount: String(amount),
  expected_close_date: "2026-12-15",
  sales_rep_id: String(rep),
  country_code: "SN",
  client_id: "c1",
});

const state = (stage: Stage, amount: number, rep = 1): DealState => ({
  stage,
  quote_amount: amount,
  expected_close_date: "2026-12-15",
  sales_rep_id: rep,
  country_code: "SN",
  client_id: "c1",
});

test("état d'une affaire à une date donnée", () => {
  const tl = timeline(
    [
      row("a", "2026-10-25T10:00:00Z", "UPDATE", "forecast", 12),
      row("a", "2026-10-20T10:00:00Z", "INSERT", "opportunite", 10),
      row("b", "2026-10-20T10:00:00Z", "INSERT", "opportunite", 5),
      row("b", "2026-10-22T10:00:00Z", "DELETE", null),
    ].map(toEvent),
  );
  assert.equal(stateAt(tl, "2026-10-19T00:00:00Z").size, 0);
  const d21 = stateAt(tl, "2026-10-21T00:00:00Z");
  assert.equal(d21.get("a")?.stage, "opportunite");
  assert.equal(d21.get("b")?.quote_amount, 5);
  const d26 = stateAt(tl, "2026-10-26T00:00:00Z");
  assert.equal(d26.get("a")?.quote_amount, 12);
  assert.equal(d26.has("b"), false, "affaire supprimée");
});

test("date d'arrivée à l'étape actuelle et date de facturation", () => {
  const events = [
    row("a", "2026-10-20T10:00:00Z", "INSERT", "opportunite"),
    row("a", "2026-10-21T10:00:00Z", "UPDATE", "forecast"),
    row("a", "2026-10-22T10:00:00Z", "UPDATE", "forecast", 20),
    row("a", "2026-10-30T10:00:00Z", "UPDATE", "won_pending", 20),
    row("a", "2026-11-05T10:00:00Z", "UPDATE", "won", 20),
  ].map(toEvent);
  assert.deepEqual(stageSince(events.slice(0, 3)), { since: "2026-10-21T10:00:00Z", fromFirstEvent: false });
  assert.deepEqual(stageSince(events.slice(0, 1)), { since: "2026-10-20T10:00:00Z", fromFirstEvent: true });
  assert.equal(wonAt(events), "2026-10-30T10:00:00Z");
  assert.equal(wonAt(events.slice(0, 3)), null);
  // Importée directement en Won : pas de date de facturation connue.
  assert.equal(wonAt([row("b", "2026-10-20T10:00:00Z", "INSERT", "won")].map(toEvent)), null);
});

test("mouvements du pipe : début + mouvements = fin", () => {
  const start = new Map<string, DealState>([
    ["hausse", state("opportunite", 10)],
    ["baisse", state("forecast", 10)],
    ["gagnee", state("forecast", 7)],
    ["perdue", state("opportunite", 4)],
    ["retour", state("opportunite", 3)],
    ["lead", state("cr_rdv", 8)],
    ["rouverte", state("perdu", 6)],
    ["autre-rep", state("opportunite", 9, 2)],
  ]);
  const end = new Map<string, DealState>([
    ["hausse", state("forecast", 15)],
    ["baisse", state("forecast", 6)],
    ["gagnee", state("won_pending", 7)],
    ["perdue", state("perdu", 4)],
    ["retour", state("prise_rdv", 3)],
    ["lead", state("opportunite", 8)],
    ["rouverte", state("a_relancer", 6)],
    ["neuve", state("opportunite", 2)],
    ["autre-rep", state("opportunite", 9, 1)],
  ]);
  const all = pipeMoves(start, end);
  assert.equal(all.start, 10 + 10 + 7 + 4 + 3 + 9);
  assert.equal(all.end, 15 + 6 + 8 + 6 + 2 + 9);
  assert.equal(all.kinds.nouvelles.amount, 10);
  assert.equal(all.kinds.reouvertes.amount, 6);
  assert.equal(all.kinds.hausses.amount, 5);
  assert.equal(all.kinds.baisses.amount, -4);
  assert.equal(all.kinds.gagnees.amount, -7);
  assert.equal(all.kinds.perdues.amount, -4);
  assert.equal(all.kinds.autres.amount, -3);
  const sum = (m: typeof all) => m.start + Object.values(m.kinds).reduce((s, k) => s + k.amount, 0);
  assert.equal(sum(all), all.end);

  // Filtre sur le commercial 1 : l'affaire réattribuée entre dans « Autres ».
  const rep1 = pipeMoves(start, end, (s) => s.sales_rep_id === 1);
  assert.equal(rep1.kinds.autres.amount, -3 + 9);
  assert.equal(sum(rep1), rep1.end);
});

test("points de la courbe hebdomadaire", () => {
  // 20 octobre 2026 = mardi ; dimanches suivants : 25 oct, 1er nov, 8 nov.
  assert.deepEqual(weeklyPoints("2026-10-20", "2026-12-31", "2026-11-11T12:00:00.000Z"), [
    "2026-10-20T23:59:59.000Z",
    "2026-10-25T23:59:59.000Z",
    "2026-11-01T23:59:59.000Z",
    "2026-11-08T23:59:59.000Z",
    "2026-11-11T12:00:00.000Z",
  ]);
  assert.deepEqual(weeklyPoints("2027-01-01", "2027-03-31", "2026-11-11T12:00:00.000Z"), []);
});

test("encaissements par mois", () => {
  const months = ["2026-10-01", "2026-11-01", "2026-12-01"];
  const deal = (id: string, stage: Stage, amount: number, collected: number, pay: string | null, close: string | null = null) => ({
    id,
    stage,
    quote_amount: amount,
    collected_amount: collected,
    expected_payment_date: pay,
    expected_close_date: close,
  });
  const { buckets, undated } = collectionMonths(
    months,
    [
      deal("retard", "won_pending", 10, 4, "2026-11-05"),
      deal("avenir", "won_pending", 8, 0, "2026-12-10"),
      deal("sans-date", "won_pending", 5, 0, null),
      deal("closing", "won_pending", 6, 0, null, "2026-11-20"), // + 30 j = 20 déc.
      deal("fc", "forecast", 9, 0, null, "2026-10-25"), // + 30 j = 24 nov.
      deal("won", "won", 7, 7, null),
    ],
    [{ deal_id: "retard", paid_on: "2026-10-28", amount: 4 }],
    new Map([["won", "2026-11-02T09:00:00Z"]]),
    "2026-11-14",
  );
  assert.deepEqual(buckets[0], { month: "2026-10-01", collected: 4, late: 0, due: 0, forecast: 0 });
  assert.deepEqual(buckets[1], { month: "2026-11-01", collected: 7, late: 6, due: 0, forecast: 9 });
  assert.deepEqual(buckets[2], { month: "2026-12-01", collected: 0, late: 0, due: 14, forecast: 0 });
  assert.deepEqual(undated, { count: 1, amount: 5 });
  assert.equal(dueDate({ expected_payment_date: null, expected_close_date: "2026-11-20" }), "2026-12-20");
});

test("pipe d'une période et taux de transformation", () => {
  const tl = timeline(
    [
      // ouverte au début, gagnée pendant la période (montant revu)
      row("a", "2026-10-20T10:00:00Z", "INSERT", "opportunite", 10),
      row("a", "2026-11-10T10:00:00Z", "UPDATE", "won_pending", 12),
      // ouverte au début, perdue
      row("b", "2026-10-20T10:00:00Z", "INSERT", "forecast", 5),
      row("b", "2026-11-05T10:00:00Z", "UPDATE", "perdu", 5),
      // créée pendant la période, toujours en cours
      row("c", "2026-11-03T10:00:00Z", "INSERT", "opportunite", 8),
      // lead jamais passé en opportunité : hors pipe
      row("d", "2026-11-03T10:00:00Z", "INSERT", "a_contacter", 3),
      // gagnée avant la période : hors pipe
      row("e", "2026-10-20T10:00:00Z", "INSERT", "won", 9),
      // gagnée après la fin de la période : encore en cours à la fin
      row("f", "2026-10-20T10:00:00Z", "INSERT", "forecast", 7),
      row("f", "2026-12-02T10:00:00Z", "UPDATE", "won", 7),
      // supprimée pendant la période
      row("g", "2026-10-20T10:00:00Z", "INSERT", "opportunite", 4),
      row("g", "2026-11-20T10:00:00Z", "DELETE", null),
    ].map(toEvent),
  );
  const cohort = pipeCohort(tl, "2026-11-01T00:00:00Z", "2026-11-30T23:59:59Z");
  const by = Object.fromEntries(cohort.map((c) => [c.id, c]));
  assert.deepEqual(Object.keys(by).sort(), ["a", "b", "c", "f", "g"]);
  assert.equal(by.a.outcome, "gagnee");
  assert.equal(by.a.state.quote_amount, 12);
  assert.equal(by.b.outcome, "perdue");
  assert.equal(by.c.outcome, "en_cours");
  assert.equal(by.c.enteredDuring, true);
  assert.equal(by.f.outcome, "en_cours");
  assert.equal(by.g.outcome, "sortie");
  assert.equal(by.g.state.quote_amount, 4);
  const s = cohortStats(cohort);
  assert.deepEqual([s.count, s.amount, s.won, s.wonAmount, s.lost, s.open, s.openAmount, s.out], [5, 36, 1, 12, 1, 2, 15, 1]);
});
