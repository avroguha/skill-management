// One dataset for an integration: JSON pages (?page=1&size=1000, up to 10,000 a page) or
// the whole of it as CSV (/api/v1/<dataset>.csv, or ?format=csv).
import { withClient, rowsOf, csvResponse, base, MAX_PAGE } from "@/lib/integrations/serve";
import { datasetByKey } from "@/lib/integrations/datasets";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  const url = new URL(req.url);
  const csv = dataset.endsWith(".csv") || url.searchParams.get("format") === "csv";
  const key = dataset.replace(/\.(csv|json)$/, "");
  return withClient(req, !csv, async (client) => {
    const def = datasetByKey(key);
    if (!def) return csv ? new Response("No such dataset", { status: 404 }) : Response.json({ error: `No dataset "${key}".` }, { status: 404 });
    if (!client.datasets.includes(def.key)) {
      return csv ? new Response("This key may not read this dataset", { status: 403 }) : Response.json({ error: `This integration may not read "${def.key}". An administrator can allow it in Admin › Integrations.` }, { status: 403 });
    }
    const rows = await rowsOf(def);
    if (csv) return csvResponse(def, rows);
    const size = Math.min(MAX_PAGE, Math.max(1, Number(url.searchParams.get("size")) || 1000));
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(pages, Math.max(1, Number(url.searchParams.get("page")) || 1));
    const next = page < pages ? `${base()}/api/v1/${def.key}?page=${page + 1}&size=${size}` : null;
    return Response.json({
      dataset: def.key, total: rows.length, page, pages, size, next,
      columns: def.columns.map((c) => ({ name: c.name, type: c.type })),
      data: rows.slice((page - 1) * size, page * size),
    }, { headers: { "cache-control": "no-store" } });
  });
}
