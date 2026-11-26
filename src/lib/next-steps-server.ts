// The viewer's next steps, once per request (the header and Home share them).
import { cache } from "react";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getEngine, getViewer } from "@/lib/server";
import { readSsoSettings } from "@/lib/sso-gate";
import { readEmailSettings } from "@/lib/mail/notify";
import { nextSteps, type NextStep, type SetupFacts } from "@/lib/next-steps";
import { getMenuFor } from "@/lib/menu-server";

export const getNextSteps = cache(async (): Promise<NextStep[]> => {
  const v = await getViewer();
  if (!v) return [];
  const engine = await getEngine();
  let setup: SetupFacts | null = null;
  if (v.isAdmin) {
    const db = await getDb();
    const live = await getDb("live");
    const [[{ n: skills }], sso, email] = await Promise.all([
      db.select({ n: count() }).from(schema.skill),
      readSsoSettings(live),
      readEmailSettings(live),
    ]);
    // in demo mode sign-on and e-mail are the real ones and not the presenter's business
    setup = { skills: Number(skills), ssoActive: v.demo ? true : sso.active, emailOn: v.demo ? true : email.enabled };
  }
  const m = await getMenuFor();
  return nextSteps(engine, v, setup, { teamChanges: m.teamChanges, requestsToApprove: m.coordinator ? m.requestsWaiting : 0, requestsReturned: m.requestsReturned });
});
