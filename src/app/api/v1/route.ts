// The integration API's index: the datasets this key may read, with their columns and links.
import { withClient, allowedSets, base } from "@/lib/integrations/serve";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withClient(req, true, async (client) => Response.json({
    integration: client.name,
    datasets: allowedSets(client).map((d) => ({
      key: d.key, title: d.title, description: d.description,
      json: `${base()}/api/v1/${d.key}`, csv: `${base()}/api/v1/${d.key}.csv`, odata: `${base()}/api/odata/${d.entity}`,
      columns: d.columns,
    })),
  }, { headers: { "cache-control": "no-store" } }));
}
