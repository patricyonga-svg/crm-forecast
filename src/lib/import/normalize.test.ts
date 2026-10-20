import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clientKind,
  displayName,
  parseAmount,
  parseBeneficiaries,
  parseClosing,
  parseCountry,
  parseStage,
  splitComment,
} from "./normalize";

test("pays et étapes", () => {
  assert.equal(parseCountry("Senegal"), "SN");
  assert.equal(parseCountry("Côte d'Ivoire"), "CI");
  assert.equal(parseCountry("Côte d’Ivoire"), "CI");
  assert.equal(parseCountry("Cameroun"), "CM");
  assert.equal(parseStage("Opportunité"), "opportunite");
  assert.equal(parseStage("Won Pending"), "won_pending");
  assert.equal(parseStage("Won"), "won");
  assert.equal(parseStage("Perdu"), null);
});

test("montants", () => {
  assert.equal(parseAmount("3 723 762 XOF"), 3723762);
  assert.equal(parseAmount("0 XOF"), 0);
  assert.equal(parseAmount("115 000 000 XOF"), 115000000);
  assert.equal(parseAmount(""), null);
});

test("bénéficiaires", () => {
  assert.equal(parseBeneficiaries("18"), 18);
  assert.equal(parseBeneficiaries("1800 "), 1800);
  assert.equal(parseBeneficiaries("500-1000"), null);
});

test("dates de closing", () => {
  assert.equal(parseClosing("30/09/2026"), "2026-09-30");
  assert.equal(parseClosing("T3"), "2026-09-30");
  assert.equal(parseClosing("T4 "), "2026-12-31");
  assert.equal(parseClosing("T1FY27"), "2027-03-31");
  assert.equal(parseClosing("T1_2027"), "2027-03-31");
  assert.equal(parseClosing("T2_2027"), "2027-06-30");
  assert.equal(parseClosing("juin-26"), "2026-06-30");
  assert.equal(parseClosing("juil.-2026"), "2026-07-31");
  assert.equal(parseClosing("août-26"), "2026-08-31");
  assert.equal(parseClosing("sept.-26"), "2026-09-30");
  assert.equal(parseClosing("déc.-26"), "2026-12-31");
  assert.equal(parseClosing("Aout 2026"), "2026-08-31");
  assert.equal(parseClosing("septembre 2026"), "2026-09-30");
  assert.equal(parseClosing("octobre 2026"), "2026-10-31");
  assert.equal(parseClosing("Mar-27"), "2027-03-31");
  assert.equal(parseClosing("Dec-26"), "2026-12-31");
  assert.equal(parseClosing("46199"), "2026-06-30");
  assert.equal(parseClosing("juin-1"), null);
  assert.equal(parseClosing(""), null);
});

test("noms des commerciaux", () => {
  assert.equal(displayName("ALICE "), "Alice");
  assert.equal(displayName("Bruno "), "Bruno");
  assert.equal(displayName("Marie Dupont"), "Marie Dupont");
});

test("type de client", () => {
  assert.equal(clientKind("Famille Exemple", "B2B2C"), "famille");
  assert.equal(clientKind("famillie Test ", "B2B2C"), "entreprise");
  assert.equal(clientKind("Cohorte Famille Exemple", "B2B Procare"), "famille");
  assert.equal(clientKind("Client Particulier", "B2C"), "particulier");
  assert.equal(clientKind("Société Alpha", "B2B & PF"), "entreprise");
});

test("découpage des commentaires", () => {
  const notes = splitComment(
    "MSO 18/08 : attend le go définitif\nCDI_20/08 : En congé\nsuite de la note\nAna 30/09/ : Le montant va évoluer\nMSO  08/10: Relance\nCDI : devis transmis",
    "2026-10-20",
  );
  assert.deepEqual(notes, [
    { author: "MSO", date: "2026-08-18", body: "attend le go définitif" },
    { author: "CDI", date: "2026-08-20", body: "En congé\nsuite de la note" },
    { author: "Ana", date: "2026-09-30", body: "Le montant va évoluer" },
    { author: "MSO", date: "2026-10-08", body: "Relance" },
    { author: "CDI", date: null, body: "devis transmis" },
  ]);
  assert.deepEqual(splitComment("Offre envoyée en attente de leur retour", "2026-10-20"), [
    { author: null, date: null, body: "Offre envoyée en attente de leur retour" },
  ]);
  assert.deepEqual(splitComment("PYO_18/12 : ancienne note", "2026-10-20")[0].date, "2025-12-18");
});
