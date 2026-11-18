// The proficiency scale (0-5) with its wording, read once per request.
import { cache } from "react";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";

export interface Level { level: number; name: string; description: string }

export const getLevels = cache(async (): Promise<Level[]> => {
  const db = await getDb();
  return (await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)))
    .map((l) => ({ level: l.level, name: l.name, description: l.description }));
});

export function levelNamer(levels: Level[]): (n: number) => string {
  const m = new Map(levels.map((l) => [l.level, l.name]));
  return (n) => m.get(n) ?? String(n);
}
