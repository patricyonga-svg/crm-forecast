// Organisation des rapports : regroupés selon la question à laquelle ils répondent.
export type ReportLink = { href: string; label: string };
export type ReportGroup = { label: string; question?: string; reports: ReportLink[] };

export const REPORT_GROUPS: ReportGroup[] = [
  { label: "Vue d'ensemble", reports: [{ href: "/rapports", label: "Synthèse" }] },
  {
    label: "Performance",
    question: "Où en est-on face aux objectifs ?",
    reports: [
      { href: "/rapports/realisations", label: "Réalisations" },
      { href: "/rapports/transformation", label: "Transformation" },
    ],
  },
  {
    label: "Pipe et prévisions",
    question: "Que va-t-on signer ?",
    reports: [
      { href: "/rapports/pipeline", label: "Pipeline" },
      { href: "/rapports/evolution", label: "Évolution" },
      { href: "/rapports/mouvements", label: "Mouvements" },
      { href: "/rapports/entonnoir", label: "Entonnoir" },
    ],
  },
  {
    label: "Suivi des affaires",
    question: "Sur quoi agir ?",
    reports: [
      { href: "/rapports/stagnation", label: "Stagnation" },
      { href: "/rapports/encaissements", label: "Encaissements" },
    ],
  },
  {
    label: "Prospection SDR",
    reports: [
      { href: "/rapports/sdr", label: "Réalisations SDR" },
      { href: "/rapports/sdr/rendez-vous", label: "Rendez-vous" },
    ],
  },
];

/** Groupe de la page affichée (le lien le plus précis l'emporte : /rapports/sdr/rendez-vous avant /rapports/sdr). */
export function currentReport(pathname: string): { group: ReportGroup; report: ReportLink } | null {
  let best: { group: ReportGroup; report: ReportLink } | null = null;
  for (const group of REPORT_GROUPS)
    for (const report of group.reports)
      if ((pathname === report.href || pathname.startsWith(`${report.href}/`)) && (!best || report.href.length > best.report.href.length)) best = { group, report };
  return best;
}
