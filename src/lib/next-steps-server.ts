// The viewer's next steps, once per request (the header and Home share them).
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getEngine, getViewer } from "@/lib/server";
import { readSsoSettings } from "@/lib/sso-gate";
import { readEmailSettings } from "@/lib/mail/notify";
import { nextSteps, type NextStep, type SetupFacts } from "@/lib/next-steps";

export const getNextSteps = cache(async (): Promise<NextStep[]> => {
  const v = await getViewer();
  if (!v) return [];
  const engine = await getEngine();
  let setup: SetupFacts | null = null;
  if (v.isAdmin) {
    const db = await getDb();
    const live = await getDb("live");
    const [[{ n: drafts }], [{ n: skills }], sso, email] = await Promise.all([
      db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "draft")),
      db.select({ n: count() }).from(schema.skill),
      readSsoSettings(live),
      readEmailSettings(live),
    ]);
    // in demo mode sign-on and e-mail are the real ones and not the presenter's business
    setup = { draftSkills: Number(drafts), skills: Number(skills), ssoActive: v.demo ? true : sso.active, emailOn: v.demo ? true : email.enabled };
  }
  return nextSteps(engine, v, setup);
});
