// Putting data back (Settings › Data & backups › Reset). An administrator can reset one
// thing - the assessments of everyone, of a team or of one person; a team's roles and needs;
// the requests - or go back to the app as it was first installed.
//
// "Out of the box" keeps the people (they come from ServiceNow or a CSV), the accounts and
// everything that connects the app to the company (single sign-on, ServiceNow, e-mail, the
// help page, the audit log, the backups). Everything people did in the app goes: ratings and
// their history, roles, team needs, changes not confirmed yet, requests, team names. The
// skill catalogue, the level wording and the rules go back to what the app ships with.
//
// The caller takes a backup first (src/app/actions/admin.ts).
import { inArray, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { DEFAULT_SETTINGS } from "./engine/engine.ts";

const chunks = <T,>(list: T[], n = 500) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Removes the ratings (and their history) of these people; null = of everyone. Returns how many ratings went. */
export async function resetAssessments(db: DB, employeeIds: string[] | null): Promise<number> {
  let n = 0;
  await db.transaction(async (tx) => {
    if (!employeeIds) {
      n = (await tx.delete(s.rating).returning({ id: s.rating.employeeId })).length;
      await tx.delete(s.ratingEvent);
      return;
    }
    for (const ids of chunks(employeeIds)) {
      n += (await tx.delete(s.rating).where(inArray(s.rating.employeeId, ids)).returning({ id: s.rating.employeeId })).length;
      await tx.delete(s.ratingEvent).where(inArray(s.ratingEvent.employeeId, ids));
    }
  });
  return n;
}

/** Removes the roles, the needs and the unconfirmed changes of these teams (by manager); null = of every team. Returns how many roles went. */
export async function resetTeams(db: DB, managerIds: string[] | null): Promise<number> {
  let n = 0;
  await db.transaction(async (tx) => {
    if (!managerIds) {
      n = (await tx.delete(s.teamRole).returning({ id: s.teamRole.id })).length;
      await tx.delete(s.teamNeed);
      await tx.delete(s.teamDraft);
      return;
    }
    for (const ids of chunks(managerIds)) {
      n += (await tx.delete(s.teamRole).where(inArray(s.teamRole.managerId, ids)).returning({ id: s.teamRole.id })).length;
      await tx.delete(s.teamNeed).where(inArray(s.teamNeed.managerId, ids));
      await tx.delete(s.teamDraft).where(inArray(s.teamDraft.managerId, ids));
    }
  });
  return n;
}

export async function resetRequests(db: DB): Promise<number> {
  return (await db.delete(s.catalogueRequest).returning({ id: s.catalogueRequest.id })).length;
}

/** Back to the app as first installed (see the top of this file for what stays). */
export async function resetToOutOfBox(db: DB): Promise<{ skills: number }> {
  const { DEFAULT_LEVELS } = await import("../db/seed.ts");
  const { STARTER_SKILLS_CSV } = await import("../db/starter-skills.ts");
  const { importCsv } = await import("./transfer.ts");
  await db.transaction(async (tx) => {
    await tx.delete(s.ratingEvent);
    await tx.delete(s.rating);
    await tx.delete(s.teamDraft);
    await tx.delete(s.teamRole);
    await tx.delete(s.teamNeed);
    await tx.delete(s.catalogueRequest);
    await tx.update(s.employee).set({ teamName: "" });
    await tx.execute(sql`delete from "skill" where "parent_id" is not null`);
    await tx.delete(s.skill);
    await tx.delete(s.skillCategory);
    await tx.delete(s.proficiencyLevel);
    await tx.insert(s.proficiencyLevel).values(DEFAULT_LEVELS);
    await tx.insert(s.appSetting).values({ key: "settings", value: DEFAULT_SETTINGS })
      .onConflictDoUpdate({ target: s.appSetting.key, set: { value: DEFAULT_SETTINGS } });
  });
  const r = await importCsv(db, "skills", STARTER_SKILLS_CSV);
  return { skills: r.created };
}
