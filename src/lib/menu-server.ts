// Who is looking, as the menu needs it, once per request (the layout and Home share it).
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getEngine, getViewer } from "@/lib/server";
import type { MenuFor } from "@/lib/menu";

export const getMenuFor = cache(async (): Promise<MenuFor> => {
  const v = await getViewer();
  if (!v) return { hasProfile: false, isManager: false, canSeeTeams: false, isAdmin: false };
  const engine = await getEngine();
  const me = v.employee;
  let draftSkills = 0;
  if (v.isAdmin) {
    const [{ n }] = await (await getDb()).select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "draft"));
    draftSkills = Number(n);
  }
  return {
    hasProfile: !!me, isManager: !!me && engine.isManager(me), canSeeTeams: v.canSeeTeams, isAdmin: v.isAdmin,
    // ratings waiting for this viewer to confirm: a count straight from the ratings
    waiting: v.role === "admin" ? 0 : engine.submittedCount(v.reportIds), draftSkills,
  };
});
