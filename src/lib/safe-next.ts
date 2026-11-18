/**
 * Where to go after signing in (?next= on /login, used by the links in e-mails). Only a path
 * inside this app: "//other.site" or "https://..." would send people elsewhere after sign-in.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /^\/login(?:[/?#]|$)/.test(next)) return "/";
  return /[\r\n]/.test(next) ? "/" : next;
}
