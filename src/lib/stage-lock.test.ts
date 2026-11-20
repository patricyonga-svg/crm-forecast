import { test } from "node:test";
import assert from "node:assert/strict";
import { canChangeStage, isLockedStageChange } from "./domain";

test("Won Pending → Won reste possible pour tout le monde", () => {
  assert.equal(isLockedStageChange("won_pending", "won"), false);
  assert.equal(canChangeStage("commercial", "won_pending", "won"), true);
});

test("retour en arrière depuis Won Pending ou Won : réservé aux administrateurs", () => {
  for (const from of ["won_pending", "won"]) {
    for (const to of ["forecast", "opportunite", "a_relancer", "perdu", "prise_rdv"]) {
      assert.equal(canChangeStage("commercial", from, to), false, `${from} → ${to}`);
      assert.equal(canChangeStage("manager", from, to), false, `${from} → ${to}`);
      assert.equal(canChangeStage("sdr", from, to), false, `${from} → ${to}`);
      assert.equal(canChangeStage("admin", from, to), true, `${from} → ${to}`);
    }
  }
  assert.equal(canChangeStage("commercial", "won", "won_pending"), false);
});

test("les autres étapes ne sont pas concernées", () => {
  assert.equal(canChangeStage("commercial", "forecast", "opportunite"), true);
  assert.equal(canChangeStage("commercial", "won", "won"), true);
  assert.equal(canChangeStage("commercial", null, "won"), true);
});
