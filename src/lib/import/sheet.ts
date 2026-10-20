// Transforme l'onglet Detail du Sheet en données prêtes à insérer, avec un rapport des anomalies.
import { randomUUID } from "node:crypto";
import {
  clientKind,
  displayName,
  key,
  parseAmount,
  parseBeneficiaries,
  parseClosing,
  parseCountry,
  parseStage,
  splitComment,
  type Stage,
} from "./normalize";

const HEADERS = {
  name: "nom client",
  country: "pays",
  beneficiaries: "nombre de beneficiaire",
  quote: "montant devis",
  closing: "mois de closing",
  stage: "sales stage",
  collected: "montant encaisse",
  businessLine: "type",
  rep: "porteur",
  comment: "commentaire",
} as const;

export type ImportedClient = { id: string; name: string; countryCode: string; kind: string };
export type ImportedDeal = {
  id: string;
  clientId: string;
  countryCode: string;
  businessLine: string | null;
  rep: string | null;
  beneficiaries: number | null;
  quoteAmount: number;
  stage: Stage;
  expectedCloseDate: string | null;
  closingRaw: string | null;
  sheetRow: number;
};
export type ImportedPayment = { dealId: string; paidOn: string; amount: number };
export type ImportedActivity = { dealId: string; happenedOn: string; authorLabel: string | null; body: string };
export type Issue = { row: number; client: string; problem: string };

export type ImportResult = {
  clients: ImportedClient[];
  deals: ImportedDeal[];
  payments: ImportedPayment[];
  activities: ImportedActivity[];
  businessLines: string[];
  reps: { name: string; countryCode: string | null }[];
  issues: Issue[];
};

/** Choisit l'orthographe à garder parmi les variantes d'un même nom (« Jerome » / « Jérôme »). */
function preferredSpelling(variants: string[]): string {
  const accents = (s: string) => (s.normalize("NFD").match(/[̀-ͯ]/g) ?? []).length;
  const counts = new Map<string, number>();
  for (const v of variants) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => accents(b[0]) - accents(a[0]) || b[1] - a[1])[0][0];
}

export function importDetail(rows: string[][], today: string): ImportResult {
  const headerIndex = rows.findIndex((r) => r.some((c) => key(c) === HEADERS.name));
  if (headerIndex < 0) throw new Error("En-tête « Nom client » introuvable");
  const header = rows[headerIndex].map(key);
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([field, label]) => {
      const i = header.findIndex((h) => h.startsWith(label));
      if (i < 0) throw new Error(`Colonne « ${label} » introuvable`);
      return [field, i];
    }),
  ) as Record<keyof typeof HEADERS, number>;

  const result: ImportResult = {
    clients: [],
    deals: [],
    payments: [],
    activities: [],
    businessLines: [],
    reps: [],
    issues: [],
  };
  const clientsByKey = new Map<string, ImportedClient>();
  const seenDeals = new Map<string, number>();
  const lineVariants = new Map<string, string[]>();
  const repVariants = new Map<string, { names: string[]; countries: Set<string> }>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    const cell = (field: keyof typeof HEADERS) => (r[col[field]] ?? "").trim();
    const sheetRow = i + 1;
    const name = cell("name").replace(/\s+/g, " ");
    if (name === "" || key(name) === "total") continue;
    const issue = (problem: string) => result.issues.push({ row: sheetRow, client: name, problem });

    const countryCode = parseCountry(cell("country"));
    if (!countryCode) {
      issue(`pays inconnu « ${cell("country")} », ligne ignorée`);
      continue;
    }

    let stage = parseStage(cell("stage"));
    if (!stage) {
      issue(`étape inconnue « ${cell("stage")} », mise en Opportunité`);
      stage = "opportunite";
    }

    let quoteAmount = parseAmount(cell("quote"));
    if (quoteAmount === null) {
      issue("montant du devis vide, mis à 0");
      quoteAmount = 0;
    } else if (quoteAmount === 0) {
      issue("montant du devis à 0");
    }

    const closingText = cell("closing");
    const expectedCloseDate = parseClosing(closingText);
    if (closingText === "") issue("date de closing vide");
    else if (!expectedCloseDate) issue(`date de closing non reconnue « ${closingText} »`);

    const beneficiariesText = cell("beneficiaries");
    const beneficiaries = parseBeneficiaries(beneficiariesText);
    if (beneficiariesText !== "" && beneficiaries === null) {
      issue(`nombre de bénéficiaires non numérique « ${beneficiariesText} »`);
    }

    const lineText = cell("businessLine").replace(/\s+/g, " ");
    let businessLine: string | null = null;
    if (lineText === "") issue("type (LoB) vide");
    else {
      const k = key(lineText);
      lineVariants.set(k, [...(lineVariants.get(k) ?? []), lineText]);
      businessLine = k;
    }

    const repText = cell("rep");
    let rep: string | null = null;
    if (repText === "") issue("porteur vide");
    else {
      const k = key(repText);
      const entry = repVariants.get(k) ?? { names: [], countries: new Set<string>() };
      entry.names.push(displayName(repText));
      entry.countries.add(countryCode);
      repVariants.set(k, entry);
      rep = k;
    }

    const clientKey = `${countryCode}|${key(name)}`;
    let client = clientsByKey.get(clientKey);
    if (!client) {
      client = { id: randomUUID(), name, countryCode, kind: clientKind(name, lineText || null) };
      clientsByKey.set(clientKey, client);
      result.clients.push(client);
    }

    const dupKey = `${clientKey}|${quoteAmount}|${stage}`;
    const firstRow = seenDeals.get(dupKey);
    if (firstRow) issue(`doublon probable de la ligne ${firstRow}`);
    else seenDeals.set(dupKey, sheetRow);

    const deal: ImportedDeal = {
      id: randomUUID(),
      clientId: client.id,
      countryCode,
      businessLine,
      rep,
      beneficiaries,
      quoteAmount,
      stage,
      expectedCloseDate,
      closingRaw: expectedCloseDate ? null : closingText || null,
      sheetRow,
    };
    result.deals.push(deal);

    // Un encaissement saisi sur une affaire Won Pending est un paiement partiel.
    const collected = parseAmount(cell("collected")) ?? 0;
    if (stage === "won_pending" && collected > 0) {
      result.payments.push({ dealId: deal.id, paidOn: expectedCloseDate && expectedCloseDate < today ? expectedCloseDate : today, amount: collected });
    } else if (stage !== "won" && stage !== "won_pending" && collected > 0) {
      issue("montant encaissé sur une affaire non gagnée, ignoré");
    }

    for (const note of splitComment(cell("comment"), today)) {
      result.activities.push({ dealId: deal.id, happenedOn: note.date ?? today, authorLabel: note.author, body: note.body });
    }
    if (beneficiariesText !== "" && beneficiaries === null) {
      result.activities.push({ dealId: deal.id, happenedOn: today, authorLabel: "Import", body: `Nombre de bénéficiaires dans le fichier : ${beneficiariesText}` });
    }
    if (deal.closingRaw) {
      result.activities.push({ dealId: deal.id, happenedOn: today, authorLabel: "Import", body: `Date de closing dans le fichier : ${deal.closingRaw}` });
    }
  }

  // Noms canoniques des LoB et des commerciaux.
  const lineNames = new Map([...lineVariants].map(([k, v]) => [k, preferredSpelling(v)]));
  const repNames = new Map([...repVariants].map(([k, v]) => [k, preferredSpelling(v.names)]));
  for (const d of result.deals) {
    if (d.businessLine) d.businessLine = lineNames.get(d.businessLine)!;
    if (d.rep) d.rep = repNames.get(d.rep)!;
  }
  result.businessLines = [...lineNames.values()].sort();
  result.reps = [...repVariants].map(([k, v]) => ({
    name: repNames.get(k)!,
    countryCode: v.countries.size === 1 ? [...v.countries][0] : null,
  }));
  result.reps.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
