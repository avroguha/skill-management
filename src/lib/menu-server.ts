// Who is looking, as the menu needs it, once per request (the layout and Home share it).
import { cache } from "react";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getEngine, getViewer } from "@/lib/server";
import type { MenuFor } from "@/lib/menu";
import { diffSetup, sanitize } from "@/lib/team-setup";
import { readDraft, readLiveSetup } from "@/lib/team-setup-db";

export const getMenuFor = cache(async (): Promise<MenuFor> => {
  const v = await getViewer();
  if (!v) return { hasProfile: false, isManager: false, canSeeTeams: false, isAdmin: false };
  const engine = await getEngine();
  const me = v.employee;
  const db = await getDb();
  const isManager = !!me && engine.isManager(me);
  const mine = v.viewAs ? v.viewAs.byUserId : v.userId;
  const [[{ n: waitingRequests }], [{ n: returned }], teamChanges] = await Promise.all([
    v.coordinator ? db.select({ n: count() }).from(schema.catalogueRequest).where(eq(schema.catalogueRequest.status, "pending")) : [{ n: 0 }],
    db.select({ n: count() }).from(schema.catalogueRequest).where(and(eq(schema.catalogueRequest.status, "returned"), eq(schema.catalogueRequest.requestedById, mine))),
    isManager ? teamChangeCount(me!.id) : 0,
  ]);
  return {
    hasProfile: !!me, isManager, canSeeTeams: v.canSeeTeams, isAdmin: v.isAdmin, coordinator: v.coordinator,
    // ratings waiting for this viewer to confirm: a count straight from the ratings
    waiting: v.role === "admin" ? 0 : engine.submittedCount(v.reportIds),
    requestsWaiting: Number(waitingRequests), requestsReturned: Number(returned), teamChanges,
  };
});

/** How many changes to a team's roles and needs are not confirmed yet. */
export const teamChangeCount = cache(async (managerId: string): Promise<number> => {
  const db = await getDb();
  const draft = await readDraft(db, managerId);
  if (!draft) return 0;
  const engine = await getEngine();
  const ctx = { people: new Set(engine.directReportsOf(managerId).map((e) => e.id)), rateable: engine.isRateable };
  return diffSetup(sanitize(await readLiveSetup(db, managerId), ctx), sanitize(draft.setup, ctx)).length;
});
