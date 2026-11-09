import { test } from "node:test";
import assert from "node:assert/strict";
import { countByPeriod, lastPeriods, leadCounts, parseCount, sdrObjective, spreadCount, type SdrDeal } from "./sdr";
import { lateCollection } from "./domain";

test("leads d'un SDR sur une période", () => {
  const deals: SdrDeal[] = [
    { sdr_id: 7, country_code: "SN", created_at: "2026-11-02T10:00:00+00:00", qualified_at: "2026-11-20T09:00:00+00:00" },
    { sdr_id: 7, country_code: "SN", created_at: "2026-10-30T10:00:00+00:00", qualified_at: "2026-11-01T09:00:00+00:00" },
    { sdr_id: 7, country_code: "SN", created_at: "2026-11-05T10:00:00+00:00", qualified_at: null },
    { sdr_id: 8, country_code: "SN", created_at: "2026-11-05T10:00:00+00:00", qualified_at: null },
    { sdr_id: null, country_code: "SN", created_at: "2026-11-05T10:00:00+00:00", qualified_at: null },
  ];
  assert.deepEqual(leadCounts(deals, 7, "2026-11-01", "2026-11-30"), { newLeads: 2, qualified: 2 });
  assert.deepEqual(leadCounts(deals, 7, "2026-10-01", "2026-10-31"), { newLeads: 1, qualified: 0 });
});

test("objectifs SDR : somme des mois, saisie et répartition", () => {
  const os = [
    { sales_rep_id: 7, month: "2026-10-01", new_leads: 10, qualified_leads: 3 },
    { sales_rep_id: 7, month: "2026-11-01", new_leads: 12, qualified_leads: 4 },
    { sales_rep_id: 8, month: "2026-11-01", new_leads: 99, qualified_leads: 99 },
  ];
  assert.deepEqual(sdrObjective(os, 7, ["2026-10-01", "2026-11-01", "2026-12-01"]), { newLeads: 22, qualified: 7 });
  assert.equal(parseCount(" 12 "), 12);
  assert.equal(parseCount(""), 0);
  assert.equal(parseCount("-3"), 0);
  assert.deepEqual(spreadCount(10, [30, 30, 40]), [3, 3, 4]);
  assert.deepEqual(spreadCount(7, [30, 30, 40]), [2, 2, 3]);
});

test("périodes glissantes", () => {
  const weeks = lastPeriods("semaine", 2, "2026-11-11");
  assert.deepEqual(weeks.map((p) => [p.from, p.to]), [
    ["2026-11-02", "2026-11-08"],
    ["2026-11-09", "2026-11-15"],
  ]);
  const months = lastPeriods("mois", 3, "2026-01-15");
  assert.deepEqual(months.map((p) => p.from), ["2025-11-01", "2025-12-01", "2026-01-01"]);
  assert.equal(months[1].to, "2025-12-31");
  const quarters = lastPeriods("trimestre", 2, "2026-02-01");
  assert.deepEqual(quarters.map((p) => p.label), ["T4 2025", "T1 2026"]);
  assert.deepEqual(countByPeriod(["2025-12-31", "2026-01-01", null], (d) => d, months), [0, 1, 1]);
});

test("encaissement en retard (Won Pending)", () => {
  const today = "2026-11-09";
  const d = (expected_close_date: string | null, expected_payment_date: string | null, stage = "won_pending") => ({ stage, expected_close_date, expected_payment_date });
  assert.equal(lateCollection(d("2026-09-01", null), today), true); // closing de plus de 30 jours
  assert.equal(lateCollection(d("2026-10-20", null), today), false); // closing récent
  assert.equal(lateCollection(d("2026-09-01", "2026-11-30"), today), false); // date prévisionnelle à venir
  assert.equal(lateCollection(d("2026-09-01", "2026-11-01"), today), true); // date prévisionnelle dépassée
  assert.equal(lateCollection(d("2026-09-01", null, "won"), today), false);
});
