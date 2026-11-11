// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes,
// CRLF or LF, a UTF-8 BOM from Excel. Header names are matched case-insensitively
// with spaces and dashes read as underscores, so "Manager e-mail" = "manager_email".

export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export const headerKey = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/e_mail/g, "email");

/** Rows as objects keyed by normalised header, with the 1-based line number of each. */
export function parseCsvObjects(text: string): { line: number; data: Record<string, string> }[] {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const keys = head.map(headerKey);
  return rest.map((r, i) => ({ line: i + 2, data: Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? "").trim()])) }));
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\r\n") + "\r\n";
}
