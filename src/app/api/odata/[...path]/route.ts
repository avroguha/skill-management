// OData v4: $metadata, an entity set (paged with @odata.nextLink), or its $count.
import { withClient, allowedSets, odataMetadata, odataSet, rowsOf } from "@/lib/integrations/serve";
import { datasetByEntity } from "@/lib/integrations/datasets";

export const dynamic = "force-dynamic";

const notFound = (what: string) => Response.json({ error: { code: "NotFound", message: what } }, { status: 404, headers: { "odata-version": "4.0" } });

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(req.url);
  return withClient(req, true, async (client) => {
    const sets = allowedSets(client);
    if (path.length === 1 && path[0] === "$metadata") return odataMetadata(sets);
    const def = datasetByEntity(path[0]);
    if (!def || !sets.includes(def)) return notFound(`No entity set "${path[0]}" for this key.`);
    const rows = await rowsOf(def);
    if (path.length === 2 && path[1] === "$count") return new Response(String(rows.length), { headers: { "content-type": "text/plain", "odata-version": "4.0", "cache-control": "no-store" } });
    if (path.length !== 1) return notFound("Only entity sets, $metadata and $count are served.");
    return odataSet(def, rows, url);
  });
}
