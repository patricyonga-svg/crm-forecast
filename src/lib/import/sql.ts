import type { ImportResult } from "./sheet";

function lit(value: string | number | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

/** Script SQL d'import, à exécuter une fois sur une base vide. */
export function toSql(data: ImportResult): string {
  const out: string[] = ["begin;"];

  for (const name of data.businessLines) {
    out.push(`insert into business_lines (name) values (${lit(name)}) on conflict (name) do nothing;`);
  }
  for (const rep of data.reps) {
    out.push(`insert into sales_reps (display_name, country_code) values (${lit(rep.name)}, ${lit(rep.countryCode)}) on conflict (display_name) do nothing;`);
  }
  for (const c of data.clients) {
    out.push(`insert into clients (id, name, country_code, kind) values (${lit(c.id)}, ${lit(c.name)}, ${lit(c.countryCode)}, ${lit(c.kind)});`);
  }
  for (const d of data.deals) {
    const line = d.businessLine ? `(select id from business_lines where name = ${lit(d.businessLine)})` : "null";
    const rep = d.rep ? `(select id from sales_reps where display_name = ${lit(d.rep)})` : "null";
    out.push(
      `insert into deals (id, client_id, country_code, business_line_id, sales_rep_id, beneficiaries, quote_amount, stage, expected_close_date, closing_raw, sheet_row) values (` +
        [lit(d.id), lit(d.clientId), lit(d.countryCode), line, rep, lit(d.beneficiaries), lit(d.quoteAmount), lit(d.stage), lit(d.expectedCloseDate), lit(d.closingRaw), lit(d.sheetRow)].join(", ") +
        `);`,
    );
  }
  for (const p of data.payments) {
    out.push(`insert into payments (deal_id, paid_on, amount) values (${lit(p.dealId)}, ${lit(p.paidOn)}, ${lit(p.amount)});`);
  }
  for (const a of data.activities) {
    out.push(`insert into activities (deal_id, happened_on, author_label, body) values (${lit(a.dealId)}, ${lit(a.happenedOn)}, ${lit(a.authorLabel)}, ${lit(a.body)});`);
  }

  out.push("commit;");
  return out.join("\n") + "\n";
}
