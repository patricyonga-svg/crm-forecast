// Usage : npx tsx scripts/import-sheet.ts <export-detail.csv> [dossier-de-sortie]
// Produit import.sql (à exécuter sur la base) et rapport-import.md (anomalies à corriger).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../src/lib/import/csv";
import { importDetail } from "../src/lib/import/sheet";
import { toSql } from "../src/lib/import/sql";
import { toReport } from "../src/lib/import/report";

const [input, outDir = "."] = process.argv.slice(2);
if (!input) {
  console.error("Usage : npx tsx scripts/import-sheet.ts <export-detail.csv> [dossier-de-sortie]");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const data = importDetail(parseCsv(readFileSync(input, "utf8")), today);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "import.sql"), toSql(data));
writeFileSync(join(outDir, "rapport-import.md"), toReport(data));
console.log(`${data.deals.length} affaires, ${data.clients.length} clients, ${data.issues.length} anomalies → ${outDir}`);
