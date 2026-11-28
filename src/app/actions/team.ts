"use server";
// A team's setup: its roles (who is in each, which skills each asks for) and what it needs.
//  - The team's manager, a manager above them or an administrator changes it.
//  - Nothing counts at once: every change goes into the team's DRAFT. Review lists what
//    differs from what is in force; each line can be taken back; Confirm puts it in force.
//  - Skills come from the catalogue, which is the same for everyone. A skill or a category
//    that is missing is asked for (Requests) and a coordinator approves it.
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, getEngine, type Viewer } from "@/lib/server";
import { applyOp, diffSetup, revertChange, sanitize, validateSetup, type SetupContext, type SetupOp, type TeamSetup } from "@/lib/team-setup";
import { applySetup, deleteDraft, readDraft, readLiveSetup, saveDraft } from "@/lib/team-setup-db";

export type Result = { ok: true; message?: string; changes?: number; id?: string } | { ok: false; error: string };

const mayManage = (v: Viewer, managerId: string) => v.isAdmin || v.manageIds.has(managerId);
const NOT_ALLOWED = "Only the team's manager, a manager above them, or an administrator changes a team's roles and needs.";

function refresh() {
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

const skillIn = z.object({ skillId: z.string().min(1), target: z.coerce.number().int().min(1).max(5), mandatory: z.boolean().default(true) });
const opIn = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addRole"), id: z.string().uuid(), name: z.string().max(200), description: z.string().max(600).optional(), color: z.string().max(20).optional(), copyOf: z.string().nullish() }),
  z.object({ op: z.literal("updateRole"), roleId: z.string().min(1), name: z.string().max(200), description: z.string().max(600).optional(), color: z.string().max(20).optional() }),
  z.object({ op: z.literal("removeRole"), roleId: z.string().min(1) }),
  z.object({ op: z.literal("moveRole"), roleId: z.string().min(1), by: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ op: z.literal("addMembers"), roleId: z.string().min(1), employeeIds: z.array(z.string().min(1)).min(1).max(2000) }),
  z.object({ op: z.literal("removeMember"), roleId: z.string().min(1), employeeId: z.string().min(1) }),
  z.object({ op: z.literal("moveMember"), from: z.string(), to: z.string().min(1), employeeId: z.string().min(1) }),
  z.object({ op: z.literal("setSkills"), roleId: z.string().min(1), skills: z.array(skillIn).min(1).max(500) }),
  z.object({ op: z.literal("removeSkill"), roleId: z.string().min(1), skillId: z.string().min(1) }),
  z.object({ op: z.literal("setNeed"), need: z.object({ skillId: z.string().min(1), minLevel: z.coerce.number().int(), headcount: z.coerce.number().int(), note: z.string().max(400).default("") }) }),
  z.object({ op: z.literal("removeNeed"), skillId: z.string().min(1), implied: z.boolean().optional() }),
  z.object({ op: z.literal("restoreNeed"), skillId: z.string().min(1) }),
  z.object({ op: z.literal("setExtras"), employeeId: z.string().min(1), skills: z.array(skillIn).min(1).max(500), note: z.string().max(400).optional() }),
  z.object({ op: z.literal("removeExtra"), employeeId: z.string().min(1), skillId: z.string().min(1) }),
]);

const DONE: Record<SetupOp["op"], string> = {
  addRole: "Role added to your changes.",
  updateRole: "Role changed.",
  removeRole: "Role removed.",
  moveRole: "Moved.",
  addMembers: "Added to the role.",
  removeMember: "Taken out of the role.",
  moveMember: "Moved.",
  setSkills: "Skills saved.",
  removeSkill: "Skill removed from the role.",
  setNeed: "Need saved.",
  removeNeed: "Need removed.",
  restoreNeed: "Need back on the list.",
  setExtras: "Asked of them.",
  removeExtra: "No longer asked of them.",
};

/** The team as the rules see it, what is in force, and the draft (kept clean of people who left and skills that were retired). */
async function load(managerId: string) {
  const engine = await getEngine();
  const manager = engine.empById.get(managerId);
  if (!manager || !engine.isManager(manager)) return { error: "Nobody reports to this person, so there is no team to set up." } as const;
  const db = await getDb();
  const ctx: SetupContext = { people: new Set(engine.directReportsOf(managerId).map((e) => e.id)), rateable: engine.isRateable };
  const live = sanitize(await readLiveSetup(db, managerId), ctx);
  const stored = await readDraft(db, managerId);
  return { db, engine, ctx, live, draft: stored ? sanitize(stored.setup, ctx) : null } as const;
}

async function keep(db: Awaited<ReturnType<typeof getDb>>, v: Viewer, managerId: string, live: TeamSetup, next: TeamSetup): Promise<number> {
  const changes = diffSetup(live, next).length;
  if (!changes) await deleteDraft(db, managerId);
  else await saveDraft(db, managerId, next, { id: v.viewAs ? v.viewAs.byUserId : v.userId, name: v.name });
  return changes;
}

/** One change to a team's roles or needs. It goes into the draft; nothing is in force until it is confirmed. */
export async function editTeam(managerId: string, input: z.input<typeof opIn>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: NOT_ALLOWED };
  const p = opIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const t = await load(managerId);
  if ("error" in t) return { ok: false, error: t.error! };
  const r = applyOp(t.draft ?? t.live, p.data as SetupOp, t.ctx);
  if (!r.ok) return r;
  const changes = await keep(t.db, v, managerId, t.live, r.setup);
  refresh();
  return { ok: true, changes, message: changes ? `${DONE[p.data.op]} Not in force yet: confirm it under Review changes.` : "Back to what is in force: nothing left to confirm.", id: p.data.op === "addRole" ? p.data.id : undefined };
}

/** Takes one change back. */
export async function undoTeamChange(managerId: string, key: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: NOT_ALLOWED };
  const t = await load(managerId);
  if ("error" in t) return { ok: false, error: t.error! };
  if (!t.draft) return { ok: true, changes: 0, message: "Nothing left to take back." };
  const r = revertChange(t.live, t.draft, key, t.ctx);
  if (!r.ok) return r;
  const changes = await keep(t.db, v, managerId, t.live, r.setup);
  refresh();
  return { ok: true, changes, message: "Taken back." };
}

/** Puts the draft in force. */
export async function confirmTeamChanges(managerId: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: NOT_ALLOWED };
  const t = await load(managerId);
  if ("error" in t) return { ok: false, error: t.error! };
  if (!t.draft) return { ok: true, changes: 0, message: "Nothing to confirm." };
  const changes = diffSetup(t.live, t.draft);
  if (!changes.length) { await deleteDraft(t.db, managerId); refresh(); return { ok: true, changes: 0, message: "Nothing to confirm." }; }
  const bad = validateSetup(t.draft, t.ctx);
  if (bad) return { ok: false, error: bad };
  await applySetup(t.db, managerId, t.draft);
  await audit(v, "confirm_team_setup", "team", managerId, { changes: changes.map((c) => c.key) });
  for (const p of ["/roles", "/people", "/my-skills", "/insights"]) revalidatePath(p);
  refresh();
  return { ok: true, changes: 0, message: `Confirmed: ${changes.length} change${changes.length === 1 ? " is" : "s are"} in force now.` };
}

/** Throws the draft away: the team stays as it is. */
export async function discardTeamChanges(managerId: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: NOT_ALLOWED };
  const db = await getDb();
  await deleteDraft(db, managerId);
  await audit(v, "discard_team_setup", "team", managerId);
  refresh();
  return { ok: true, changes: 0, message: "Changes discarded. The team is as it was." };
}

export async function setTeamName(managerId: string, name: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: "Only the team's manager, a manager above them, or an administrator can rename it." };
  const n = z.string().trim().max(80, "At most 80 characters.").safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Check the name." };
  const db = await getDb();
  await db.update(schema.employee).set({ teamName: n.data }).where(eq(schema.employee.id, managerId));
  await audit(v, "rename_team", "employee", managerId, { teamName: n.data });
  revalidatePath("/", "layout");
  return { ok: true, message: n.data ? "Renamed." : "The team is called after its manager again." };
}
