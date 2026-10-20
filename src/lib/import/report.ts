import type { ImportResult } from "./sheet";

const STAGE_LABELS = { opportunite: "Opportunité", forecast: "Forecast", won_pending: "Won Pending", won: "Won" };

/** Rapport lisible des anomalies trouvées dans le fichier, à faire corriger par l'équipe. */
export function toReport(data: ImportResult): string {
  const byStage = new Map<string, number>();
  for (const d of data.deals) byStage.set(d.stage, (byStage.get(d.stage) ?? 0) + 1);

  const byProblem = new Map<string, number>();
  for (const i of data.issues) {
    const kind = i.problem.replace(/ «.*$/, "").replace(/ de la ligne \d+$/, "");
    byProblem.set(kind, (byProblem.get(kind) ?? 0) + 1);
  }

  const lines = [
    "# Rapport d'import du fichier de forecast",
    "",
    `- Affaires importées : ${data.deals.length}`,
    `- Clients distincts : ${data.clients.length}`,
    `- Paiements partiels repris : ${data.payments.length}`,
    `- Notes d'historique : ${data.activities.length}`,
    `- Étapes : ${[...byStage].map(([s, n]) => `${STAGE_LABELS[s as keyof typeof STAGE_LABELS]} ${n}`).join(", ")}`,
    "",
    "## Lignes de business retenues",
    "",
    ...data.businessLines.map((l) => `- ${l}`),
    "",
    "## Commerciaux retenus",
    "",
    ...data.reps.map((r) => `- ${r.name}${r.countryCode ? ` (${r.countryCode})` : " (plusieurs pays)"}`),
    "",
    "## Anomalies par type",
    "",
    "| Anomalie | Lignes |",
    "|---|---|",
    ...[...byProblem].sort((a, b) => b[1] - a[1]).map(([p, n]) => `| ${p} | ${n} |`),
    "",
    "## Détail des anomalies",
    "",
    "| Ligne | Client | Anomalie |",
    "|---|---|---|",
    ...data.issues.map((i) => `| ${i.row} | ${i.client.replace(/\|/g, "/")} | ${i.problem.replace(/\|/g, "/")} |`),
    "",
  ];
  return lines.join("\n");
}
