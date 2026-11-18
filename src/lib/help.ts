// Help content an administrator can change (Settings › Help page): the FAQ and how to
// reach the people who run the portal. Stored in app_setting "help"; the defaults below
// answer the questions people ask in the first weeks.
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import type { DB } from "../db/index.ts";

export interface Faq { q: string; a: string; audience: "everyone" | "manager" | "admin" }
export interface Contact { team: string; email: string; channel: string; channelUrl: string; phone: string; hours: string; note: string }
export interface Help { faq: Faq[]; contact: Contact }

export const DEFAULT_HELP: Help = {
  contact: {
    team: "The skills portal team",
    email: "",
    channel: "",
    channelUrl: "",
    phone: "",
    hours: "Working days, 09:00-18:00",
    note: "",
  },
  faq: [
    { audience: "everyone", q: "What is this for?", a: "It records which skills each person has and at what level, against what their role needs, so managers and leaders can see what each team can do, what it is short of, and who elsewhere already has it. It is about capability, not performance: nothing here rates how well anyone does their job." },
    { audience: "everyone", q: "What do the levels 0 to 5 mean?", a: "0 No exposure, 1 Awareness, 2 Working, 3 Proficient, 4 Advanced, 5 Expert. My skills has a \"What the levels mean\" panel with the full wording; pick the level whose description fits what you can do on your own today." },
    { audience: "everyone", q: "How do I rate my skills?", a: "Open My skills. Tap a level for each skill your role asks for (the target is underlined), add any other skills you have from the search box at the bottom, then press Send. Your manager confirms each level, changes it, or sends it back with a note; you get an e-mail either way." },
    { audience: "everyone", q: "I manage people. Do I have to rate myself?", a: "No. Managers are not asked to, and they count in no gap. You can still add the skills you have in My skills: they count in your team's capability, and show leaders what you can do." },
    { audience: "everyone", q: "Why does a skill show a target?", a: "Targets come from your job role and grade (Settings › Roles & targets). They are what the role needs, not a judgement of you." },
    { audience: "everyone", q: "My manager or designation is wrong.", a: "People, managers and designations come from ServiceNow and refresh automatically. Ask for the correction there; it comes through at the next sync." },
    { audience: "everyone", q: "A skill I have is not in the list.", a: "Type it in the search box on My skills; when nothing matches, add it there. A manager's new skill joins the catalogue at once; anyone else's waits for an administrator." },
    { audience: "everyone", q: "Who can see my ratings?", a: "You, your manager and the managers above them, leaders, and the administrators. Colleagues do not see them." },
    { audience: "manager", q: "How do I confirm my team's ratings?", a: "My team › To confirm (the number on the menu says how many wait). Each level starts at what the person chose: agree, tap another level, or write a note and send it back. Confirm all does everyone's at once. The confirmed level is the one every number uses." },
    { audience: "manager", q: "How do I remind people who have not started?", a: "My team › People › Remind: choose who, add a note if you like. Each gets one e-mail with what they still have to rate (at most one a day). With e-mail switched on, people who still have something to do are also reminded once a week, and you get a weekly digest of what waits for you." },
    { audience: "manager", q: "How do I say what my team needs?", a: "My team › Needs › Add a need: the skill, the level and how many people. The app shows where the team is short or rests on one person, and who elsewhere in the organisation already has it. Needs are also implied when two or more of your people have a role that asks for a skill." },
    { audience: "manager", q: "What is Insights?", a: "The picture of your team, or (for leaders) any team or the whole organisation: the headline numbers, capability by team and category, where teams are short, the strongest skills, and people who already have what another team is short of. Pick a team at the top right." },
    { audience: "everyone", q: "What is demo mode?", a: "The Demo button at the top, open to everyone, switches your browser to a made-up organisation: the easiest way to learn the app, and for presentations, like a phone's store mode. An orange bar shows it is on; you can be the head of the organisation, a director, a manager, a team member or an administrator. Nothing you do there reaches the real data, and no e-mail is sent. Back to real data switches back; managers and above can also reset the made-up data." },
    { audience: "everyone", q: "What is the Next button at the top?", a: "The one thing that matters most for you to do now: rate your skills, send them, look at ratings sent back; for a manager, confirm ratings, remind people, say what the team needs; for an administrator, what the app still needs. Home lists it with what comes after it. When there is nothing to do, the button is not shown." },
    { audience: "manager", q: "What does the blue dot in the skills grid mean?", a: "The person has sent that rating and it is waiting for you to confirm it. The cell shows their own level in grey italics until you do; hover it for the details, or open My team › To confirm." },
    { audience: "admin", q: "Where is everything set up?", a: "Settings, one section per item on its left: people and access, skills (with CSV upload), roles and targets, levels and rules, ServiceNow, single sign-on, e-mail, data and backups, demo, audit log and this help page. Every field has an (i) that says what it does." },
    { audience: "admin", q: "How do I load a skill catalogue?", a: "A starter catalogue of common IT skills is loaded on the first start. Settings › Skills: download the catalogue, change it in a spreadsheet, and upload it again (columns category, skill, sub_skill, aliases, description, status). The upload updates skills that exist by name and adds the new ones; columns left out keep what is there, and nothing is deleted. Check it first: new skills that look like existing ones are listed with a choice (merge, replace, keep both, skip) before anything is saved." },
    { audience: "admin", q: "What if single sign-on stops working?", a: "Sign in with the local admin account: the sign-in page keeps its username and password form next to the single sign-on button. That account stays for this reason and cannot be disabled; change its password once single sign-on works and keep it somewhere safe." },
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
