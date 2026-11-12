// OData v4 service document: the entity sets this key may read (Power BI, Tableau).
import { withClient, allowedSets, odataService } from "@/lib/integrations/serve";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withClient(req, true, async (client) => odataService(allowedSets(client)));
}
