export function fmtPct(n: number | null | undefined): string {
  return n == null ? "–" : `${n}%`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "–";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ago(d: Date | null | undefined, now = Date.now()): string {
  if (!d) return "never";
  const days = Math.round((now - d.getTime()) / 86400e3);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}y ${rest}mo ago` : `${years}y ago`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
