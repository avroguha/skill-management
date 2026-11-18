// First-start seeding of the live database. Idempotent: every step checks before it writes.
//
//   always    the six proficiency levels (0-5) and default settings
//   always    the local administrator admin / admin when no user exists yet
//   always    the starter skill catalogue when there are no skills at all (a fresh install;
//             a site that imported version 1 or uploaded its own keeps what it has)
//
// Made-up people live only in the demo database (src/db/demo.ts), never here.
import { count, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { DB } from "./index.ts";
import * as s from "./schema.ts";
import { DEFAULT_SETTINGS } from "../lib/engine/engine.ts";

export const DEFAULT_LEVELS = [
  { level: 0, name: "No Exposure", description: "Has not used it. Cannot describe what it is for." },
  { level: 1, name: "Awareness", description: "Can explain what it is and when it is used. Needs step-by-step help to do anything with it." },
  { level: 2, name: "Working", description: "Does routine tasks on their own, following known patterns. Asks for help with anything unusual." },
  { level: 3, name: "Proficient", description: "Handles the full range of everyday work without help, including diagnosing problems. Reviews others' routine work." },
  { level: 4, name: "Advanced", description: "Handles the hard and unusual cases, designs solutions others build on, and coaches others to Proficient." },
  { level: 5, name: "Expert", description: "Recognised authority inside and outside the team. Sets standards and direction; others escalate to them." },
];

export async function seed(db: DB): Promise<void> {
  const [{ n: levels }] = await db.select({ n: count() }).from(s.proficiencyLevel);
  if (levels === 0) await db.insert(s.proficiencyLevel).values(DEFAULT_LEVELS);

  const settings = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "settings"));
  if (!settings.length) await db.insert(s.appSetting).values({ key: "settings", value: DEFAULT_SETTINGS });

  const [{ n: users }] = await db.select({ n: count() }).from(s.user);
  if (users === 0) await createLocalAdmin(db);

  const [{ n: skills }] = await db.select({ n: count() }).from(s.skill);
  if (skills === 0) {
    const { importCsv } = await import("../lib/transfer.ts");
    const { STARTER_SKILLS_CSV } = await import("./starter-skills.ts");
    const r = await importCsv(db, "skills", STARTER_SKILLS_CSV);
    console.log(`seed: the starter skill catalogue, ${r.created} skills`);
  }
}

/** admin / admin. Sign-in does not check password length, so the short seed password works;
 *  every password set afterwards must meet the minimum (src/lib/auth.ts). */
export async function createLocalAdmin(db: DB): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(s.user).values({
    id,
    name: "Administrator",
    email: process.env.ADMIN_EMAIL || "admin@skills.local",
    emailVerified: true,
    username: "admin",
    displayUsername: "admin",
    role: "admin",
    // Off unless asked for. The account is kept for good, also once SSO is on (src/lib/local-admin.ts).
    mustChangePassword: process.env.FORCE_PASSWORD_CHANGE === "true",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(s.account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword("admin"),
    createdAt: now,
    updatedAt: now,
  });
  console.log("seed: created the local administrator admin / admin");
}
