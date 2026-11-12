// A small ServiceNow Table API client (basic auth): enough to read sys_user.
// Every error says what was asked and what came back, because at work it is read by
// someone who cannot debug from here.
export interface SnOptions {
  instanceUrl: string;
  username: string;
  password: string;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type SnRecord = Record<string, string>;

export class SnError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Values go into encoded queries; these characters would change the query's meaning. */
export function assertQueryValue(v: string, what: string): string {
  if (/[\^=,\r\n]/.test(v)) throw new SnError(`${what} may not contain ^ = , or line breaks: "${v}"`);
  return v;
}

export function assertFieldName(f: string): string {
  if (!/^[a-z0-9_.]+$/i.test(f)) throw new SnError(`Not a field name: "${f}"`);
  return f;
}

export function createServiceNow(o: SnOptions) {
  const base = o.instanceUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/i.test(base)) throw new SnError(`The instance URL must look like https://company.service-now.com (was "${o.instanceUrl}")`);
  const f = o.fetchImpl ?? fetch;
  const auth = "Basic " + Buffer.from(`${o.username}:${o.password}`).toString("base64");

  async function call(path: string): Promise<{ body: { result?: unknown; error?: { message?: string; detail?: string } }; total: number | null }> {
    const url = `${base}${path}`;
    let r: Response;
    try {
      r = await f(url, {
        headers: { authorization: auth, accept: "application/json" },
        signal: AbortSignal.timeout(o.timeoutMs ?? 30000),
      });
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      throw new SnError(`Could not reach ${base} (${cause ?? (e as Error).name}: ${(e as Error).message}). Check the URL, DNS and, at work, the proxy (RUNTIME_HTTPS_PROXY).`);
    }
    const text = await r.text();
    let body: { result?: unknown; error?: { message?: string; detail?: string } } = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (r.status === 401) throw new SnError(`${base} refused the user "${o.username}" (401). Check the username and password, and that the account is not locked.`, 401);
    if (r.status === 403) throw new SnError(`"${o.username}" may not read this (403: ${body.error?.message ?? "forbidden"}). It needs read access to the table (for sys_user, a role such as snc_read_only, or an ACL).`, 403);
    if (!r.ok) {
      const hint = /<html/i.test(text) ? " The instance answered with a web page - it may be hibernating or the URL is wrong." : "";
      throw new SnError(`${base}${path.split("?")[0]} answered ${r.status}: ${body.error?.message ?? text.slice(0, 160)}${hint}`, r.status);
    }
    if (body.result === undefined) throw new SnError(`${base} did not answer as a ServiceNow instance (no "result" in the response).`);
    const total = r.headers.get("x-total-count");
    return { body, total: total == null ? null : Number(total) };
  }

  /** One page of a table query. */
  async function page(table: string, query: string, fields: string[], limit: number, offset: number) {
    const qs = new URLSearchParams({
      sysparm_query: query,
      sysparm_fields: fields.join(","),
      sysparm_limit: String(limit),
      sysparm_offset: String(offset),
      sysparm_display_value: "false",
      sysparm_exclude_reference_link: "true",
    });
    const { body, total } = await call(`/api/now/table/${assertFieldName(table)}?${qs}`);
    return { rows: body.result as SnRecord[], total };
  }

  /** Every record matching the query, page by page, ordered by sys_id so pages never shift. */
  async function all(table: string, query: string, fields: string[], max = 50000, pageSize = 1000): Promise<SnRecord[]> {
    const out: SnRecord[] = [];
    const q = query ? `${query}^ORDERBYsys_id` : "ORDERBYsys_id";
    for (let offset = 0; out.length < max; offset += pageSize) {
      const { rows } = await page(table, q, fields, Math.min(pageSize, max - out.length), offset);
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    return out;
  }

  /** Distinct values of a field and how many records have each (the stats API). */
  async function distinct(table: string, field: string, query = ""): Promise<{ value: string; count: number }[]> {
    const qs = new URLSearchParams({ sysparm_count: "true", sysparm_group_by: assertFieldName(field), sysparm_query: query });
    const { body } = await call(`/api/now/stats/${assertFieldName(table)}?${qs}`);
    const rows = (Array.isArray(body.result) ? body.result : [body.result]) as { stats?: { count?: string }; groupby_fields?: { value?: string }[] }[];
    return rows.filter((r) => r?.groupby_fields).map((r) => ({ value: r.groupby_fields?.[0]?.value ?? "", count: Number(r.stats?.count ?? 0) }))
      .sort((a, b) => b.count - a.count);
  }

  return { base, page, all, distinct };
}

export type ServiceNow = ReturnType<typeof createServiceNow>;
