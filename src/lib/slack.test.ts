import { test } from "node:test";
import assert from "node:assert/strict";
import { meetingMessage, slackEscape, winMessage } from "./slack";

const base = {
  title: "Cartes cadeaux",
  client: "Société Exemple",
  country: "Sénégal",
  businessLine: "Cartes",
  amount: "1 000 000 XOF",
  beneficiaries: 50,
  rep: { name: "Alice Test", slackId: "U123" },
  sdr: { name: "Bob Test", slackId: null },
  saleChannel: "Interne",
  expectedPayment: "15 déc. 2026",
  collected: "1 000 000 XOF",
  link: "https://exemple.test/affaires/1",
};

test("Won Pending : commercial mentionné, date d'encaissement, pas de montant encaissé", () => {
  const m = winMessage({ ...base, stage: "won_pending" });
  assert.match(m, /Won Pending/);
  assert.match(m, /<@U123>/);
  assert.match(m, /\*Bob Test\*/);
  assert.match(m, /Encaissement prévu le 15 déc\. 2026/);
  assert.doesNotMatch(m, /Encaissé :/);
});

test("Won : encaissement complet", () => {
  const m = winMessage({ ...base, stage: "won" });
  assert.match(m, /encaissement est à présent complet/);
  assert.match(m, /Encaissé : \*1 000 000 XOF\*/);
  assert.doesNotMatch(m, /Encaissement prévu/);
});

test("Rendez-vous : lignes vides retirées et texte échappé", () => {
  const m = meetingMessage({ client: "A<B>", title: "A<B>", rep: "Alice", when: "lun. 17 nov. 10:00", minutes: 60, location: null, who: "", notes: null, bookedBy: "Bob", link: "https://x" });
  assert.match(m, /A&lt;B&gt;/);
  assert.doesNotMatch(m, /Où :|Avec :|Affaire :|Notes :/);
  assert.equal(slackEscape("a & b"), "a &amp; b");
});
