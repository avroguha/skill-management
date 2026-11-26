// What the "ask for a new skill or category" dialog needs, once per request: the categories,
// the skills a sub-skill can go under, the names already in the catalogue, and who decides.
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getEngine, getViewer } from "@/lib/server";
import type { AskCatalogue } from "@/components/ask-dialog";

/** The people who decide on requests, by name: the coordinators. Administrators can always decide too. */
export const approverNames = cache(async (): Promise<string[]> => {
  const v = await getViewer();
  if (v?.demo) {
    const { demoPersonas } = await import("@/db/demo");
    const ids = await demoPersonas(await getDb("demo"));
    const engine = await getEngine();
    const c = ids?.coordinator ? engine.empById.get(ids.coordinator) : undefined;
    return c ? [c.name] : [];
  }
  const db = await getDb("live");
  const users = await db.select({ name: schema.user.name, banned: schema.user.banned }).from(schema.user).where(inArray(schema.user.role, ["coordinator"]));
  return users.filter((u) => !u.banned).map((u) => u.name).sort((a, b) => a.localeCompare(b));
});

/** "Ilmari Voss, Sera Dunmoor or an administrator". */
export function approversText(names: string[]): string {
  if (!names.length) return "an administrator (no coordinator has been named yet)";
  const shown = names.slice(0, 4).join(", ");
  return `${shown}${names.length > 4 ? ` and ${names.length - 4} more coordinators` : ""} or an administrator`;
}

export const getAskCatalogue = cache(async (): Promise<AskCatalogue> => {
  const engine = await getEngine();
  const live = [...engine.skillById.values()].filter((s) => s.status === "active");
  return {
    categories: [...engine.categoryById.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name })),
    parents: live.filter((s) => !s.parentId).map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId })).sort((a, b) => a.name.localeCompare(b.name)),
    skills: live.map((s) => ({ id: s.id, name: engine.skillLabel(s.id), aliases: [s.name], hint: engine.categoryById.get(s.categoryId)?.name ?? "", href: `/skills/${s.id}` })),
    approvers: approversText(await approverNames()),
  };
});
