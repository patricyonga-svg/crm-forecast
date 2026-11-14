import { test } from "node:test";
import assert from "node:assert/strict";
import { account, byPriority, type PremiumDeal } from "./premium";

const today = "2026-11-14";
const base: PremiumDeal = {
  id: "d1",
  client_id: "c1",
  name: null,
  stage: "forecast",
  country_code: "CI",
  sales_rep_id: 1,
  quote_amount: 100_000_000,
  forecast_amount: 100_000_000,
  invoiced_amount: 0,
  collected_amount: 0,
  expected_close_date: "2026-12-15",
  expected_payment_date: null,
  next_action: "Relance devis",
  next_action_date: "2026-11-20",
  created_at: "2026-10-01T00:00:00Z",
};
const client = { id: "c1", name: "Client fictif", country_code: "CI" };

test("compte suivi : vert, pipe et forecast calculés", () => {
  const a = account(client, [base, { ...base, id: "d2", stage: "won", invoiced_amount: 50, collected_amount: 50, quote_amount: 50 }], "2026-11-10", today);
  assert.equal(a.health, "ok");
  assert.equal(a.pipe, 100_000_000);
  assert.equal(a.forecast, 100_000_000);
  assert.equal(a.invoiced, 50);
  assert.equal(a.next?.text, "Relance devis");
});

test("action en retard : orange", () => {
  const a = account(client, [{ ...base, next_action_date: "2026-11-05" }], "2026-11-10", today);
  assert.equal(a.health, "warn");
  assert.match(a.issues[0], /9 j de retard/);
});

test("aucune action prévue ou plus de 30 jours sans contact : rouge", () => {
  assert.equal(account(client, [{ ...base, next_action: null, next_action_date: null }], "2026-11-10", today).health, "bad");
  assert.equal(account(client, [base], "2026-10-01", today).health, "bad");
  assert.equal(account(client, [base], null, today).health, "bad");
});

test("prospection hors pipe ; sans affaire en cours : gris", () => {
  assert.equal(account(client, [{ ...base, stage: "a_contacter" }], "2026-11-10", today).pipe, 0);
  assert.equal(account(client, [{ ...base, stage: "perdu" }], null, today).health, "idle");
});

test("tri : rouges d'abord, puis plus gros pipe", () => {
  const red = account({ ...client, id: "r" }, [{ ...base, next_action_date: null }], today, today);
  const big = account({ ...client, id: "b" }, [{ ...base, quote_amount: 900 }], today, today);
  const small = account({ ...client, id: "s" }, [{ ...base, quote_amount: 10 }], today, today);
  assert.deepEqual([small, big, red].sort(byPriority).map((a) => a.id), ["r", "b", "s"]);
});
