import { test } from "node:test";
import assert from "node:assert/strict";
import { coverage, elapsed, formatM, funnel, groupByCountry, inQuarter, monthEnd, previousQuarter, realised, type ReportDeal } from "./reports";

const deal = (stage: ReportDeal["stage"], date: string | null, amount: number, rep: number | null = 1): ReportDeal => ({
  country_code: "SN",
  sales_rep_id: rep,
  stage,
  expected_close_date: date,
  quote_amount: amount,
  forecast_amount: stage === "opportunite" ? 0 : amount,
  invoiced_amount: stage === "won_pending" || stage === "won" ? amount : 0,
});

test("trimestres et mois", () => {
  assert.equal(previousQuarter("2026-T1"), "2025-T4");
  assert.equal(previousQuarter("2026-T4"), "2026-T3");
  assert.equal(monthEnd("2026-02-01"), "2026-02-28");
  assert.equal(monthEnd("2026-10-01"), "2026-10-31");
  assert.equal(elapsed("2026-10-01", "2026-10-31", "2026-10-16"), 16 / 31);
  assert.equal(elapsed("2026-10-01", "2026-10-31", "2026-11-02"), 1);
  assert.equal(elapsed("2026-10-01", "2026-10-31", "2026-09-30"), 0);
});

test("affaires d'un trimestre : retards ouverts inclus, affaires gagnées du trimestre précédent exclues", () => {
  assert.equal(inQuarter(deal("forecast", "2026-11-10", 1), "2026-T4"), true);
  assert.equal(inQuarter(deal("forecast", "2026-08-10", 1), "2026-T4"), true);
  assert.equal(inQuarter(deal("won", "2026-08-10", 1), "2026-T4"), false);
  assert.equal(inQuarter(deal("opportunite", "2026-04-10", 1), "2026-T4"), false);
  assert.equal(inQuarter(deal("opportunite", null, 1), "2026-T4"), false);
});

test("réalisé, couverture et entonnoir", () => {
  const deals = [
    deal("won", "2026-10-05", 10),
    deal("won_pending", "2026-11-05", 20),
    deal("forecast", "2026-12-05", 30),
    deal("opportunite", "2026-12-05", 100),
    deal("won", "2026-09-05", 1000),
  ];
  assert.equal(realised(deals, "2026-10-01", "2026-10-31"), 10);
  const c = coverage(deals, 50, "2026-T4", { forecast_multiple: 1.5, pipe_multiple: 3 });
  assert.deepEqual(c, { objective: 50, done: 30, forecast: 60, pipe: 160, forecastNeeded: 75, pipeNeeded: 225 });
  assert.deepEqual(
    funnel(deals.slice(0, 4)).map((l) => [l.label, l.count, l.amount]),
    [
      ["Opportunité", 4, 160],
      ["Forecast", 3, 60],
      ["Won Pending", 2, 30],
      ["Won", 1, 10],
    ],
  );
});

test("regroupement par pays avec ligne « Sans commercial »", () => {
  const groups = groupByCountry(
    [
      { code: "SN", name: "Sénégal" },
      { code: "CM", name: "Cameroun" },
    ],
    [
      { id: 1, display_name: "Awa", country_code: "SN" },
      { id: 2, display_name: "Ancien", country_code: "SN", active: false },
    ],
    [deal("won", "2026-10-05", 10), deal("won", "2026-10-05", 5, null)],
    [],
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].reps.map((r) => [r.name, r.deals.length]),
    [
      ["Awa", 1],
      ["Sans commercial", 1],
    ],
  );
});

test("montants en millions", () => {
  assert.equal(formatM(20_400_000), "20 M");
  assert.equal(formatM(9_400_000), "9,4 M");
});
