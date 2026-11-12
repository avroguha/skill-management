// Photo URLs from the template in Admin › ServiceNow (Photos), per person.
import { cache } from "react";
import { getDb, schema } from "@/db";
import { readProfileSettings, photoUrl } from "@/lib/directory/config";

export const photoUrls = cache(async (): Promise<Map<string, string>> => {
  const db = await getDb();
  const { photoUrlTemplate } = await readProfileSettings(db);
  const out = new Map<string, string>();
  if (!photoUrlTemplate) return out;
  const rows = await db.select({
    id: schema.employee.id, email: schema.employee.email, userName: schema.employee.userName,
    externalId: schema.employee.externalId, attributes: schema.employee.attributes,
  }).from(schema.employee);
  for (const r of rows) {
    const url = photoUrl(photoUrlTemplate, r);
    if (url) out.set(r.id, url);
  }
  return out;
});
