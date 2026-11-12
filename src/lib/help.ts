// Help content an administrator can change (Admin › Help & feedback): the FAQ and how to
// reach the people who run the portal. Stored in app_setting "help"; the defaults below
// answer the questions people ask in the first weeks.
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import type { DB } from "../db/index.ts";

export interface Faq { q: string; a: string; audience: "everyone" | "manager" | "admin" }
export interface Contact { team: string; email: string; channel: string; channelUrl: string; phone: string; hours: string; note: string }
export interface Help { faq: Faq[]; contact: Contact }

export const FEEDBACK_KINDS = [
  { id: "bug", label: "Something is broken" },
  { id: "data", label: "My data is wrong" },
  { id: "access", label: "Access or sign-in" },
  { id: "question", label: "A question" },
  { id: "idea", label: "An idea" },
  { id: "other", label: "Something else" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];
export const FEEDBACK_STATUS = { new: "New", in_progress: "In progress", done: "Done" } as const;

export const DEFAULT_HELP: Help = {
  contact: {
    team: "The skills portal team",
    email: "",
    channel: "",
    channelUrl: "",
    phone: "",
    hours: "Working days, 09:00-18:00",
    note: "For a problem with the portal, the Feedback form is fastest: it tells us which page you were on.",
  },
  faq: [
    { audience: "everyone", q: "What is this portal for?", a: "It records which skills each person has and at what level, compares them with what their role needs, and shows teams where capability is thin. It is about capability, not performance: nothing here rates how well anyone does their job." },
    { audience: "everyone", q: "What do the levels 0 to 5 mean?", a: "0 means no knowledge, 5 means expert who teaches others. The exact wording of each level is shown next to every rating, so pick the one whose description fits you best." },
    { audience: "everyone", q: "How do I rate my skills?", a: "Open Self-assessment, choose a level for each skill your role needs (and any others you hold), then Submit. Your manager validates the ratings: they agree, or adjust them after a conversation with you." },
    { audience: "everyone", q: "Why does a skill show a target?", a: "Targets come from your role and grade. A manager can set a personal target for a project. Targets are what the role needs, not a judgement of you." },
    { audience: "everyone", q: "My manager, unit or designation is wrong.", a: "People, managers and designations come from the company directory (ServiceNow) and refresh automatically. Ask for the correction there; send Feedback with \"My data is wrong\" if it does not come through within a day." },
    { audience: "everyone", q: "Can I add a skill that is not in the list?", a: "Yes: in Self-assessment, use Suggest a skill. An administrator reviews suggestions and adds them to the catalogue." },
    { audience: "everyone", q: "Who can see my ratings?", a: "You, your manager and the managers above them, executives, and the administrators who run the portal. Colleagues do not see them." },
    { audience: "manager", q: "How do I validate my team's ratings?", a: "Open Validate. Agree with a rating, change it (the person sees your level and note), or send it back with a question. Ratings you validate become the official level." },
    { audience: "manager", q: "How do I set what my team needs?", a: "My team › Skills needed: add a skill, the level and how many people should have it. The portal shows where you are short, or where only one person holds it." },
    { audience: "manager", q: "What is the Talent page?", a: "A picture of your organisation at any level: its strengths, what is lacking, how deep each area is, and people who hold skills beyond their role. Pick a unit to look at another level." },
    { audience: "admin", q: "How do I connect Power BI or Tableau?", a: "Admin › Integrations › New integration: choose the tool and the datasets. The key is shown once, with the connection steps for that tool." },
    { audience: "admin", q: "How do I see exactly what someone else sees?", a: "Open the person and choose View as. Everything is read-only while you do, and the audit log records it." },
  ],
};

export async function readHelp(db: DB): Promise<Help> {
  const [row] = await db.select().from(schema.appSetting).where(eq(schema.appSetting.key, "help"));
  const v = (row?.value ?? {}) as Partial<Help>;
  return {
    faq: Array.isArray(v.faq) ? v.faq : DEFAULT_HELP.faq,
    contact: { ...DEFAULT_HELP.contact, ...(v.contact ?? {}) },
  };
}

export async function writeHelp(db: DB, help: Help) {
  await db.insert(schema.appSetting).values({ key: "help", value: help as never })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: help as never } });
}
