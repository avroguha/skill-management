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
    { audience: "everyone", q: "Why does a skill show a target?", a: "A target is the level a role you are in asks for in that skill. Your manager made the roles of your team and put you in them (Roles shows them). When two of your roles ask for the same skill, the higher level counts. It is what the role needs, not a judgement of you." },
    { audience: "everyone", q: "My manager or designation is wrong.", a: "People, managers and designations come from ServiceNow and refresh automatically. Ask for the correction there; it comes through at the next sync." },
    { audience: "everyone", q: "A skill I have is not in the list.", a: "Type it in the search box on My skills first: it may be there under another name. When nothing matches, press Ask for it as a new skill (or open Requests). Skills and categories are the same for everyone, so a coordinator approves a new one first. Requests shows where yours is and with whom: waiting, sent back to you with a note to change it, approved, or not approved with the reason." },
    { audience: "everyone", q: "Who can see my ratings?", a: "You, your manager and the managers above them, leaders, and the administrators. Colleagues do not see them, and you do not see theirs: someone who manages nobody sees only what is their own (their skills and ratings, the roles they are in, their requests) and the skill catalogue. Only a person's managers see that person's details." },
    { audience: "manager", q: "How do I confirm my team's ratings?", a: "My team › To confirm (the number on the menu says how many wait). Each level starts at what the person chose: agree, tap another level, or write a note and send it back. Confirm all does everyone's at once. The confirmed level is the one every number uses." },
    { audience: "manager", q: "How do I remind people who have not started?", a: "My team › People › Remind: choose who, add a note if you like. Each gets one e-mail with what they still have to rate (at most one a day). With e-mail switched on, people who still have something to do are also reminded once a week, and you get a weekly digest of what waits for you." },
    { audience: "manager", q: "How do I say what my team needs?", a: "My team › Team needs › Add a need: the skill, the level and how many people. The app shows where the team is short or rests on one person, and who elsewhere in the organisation already has it. A need is also listed “from the roles” when two or more of your people are in a role that asks for a skill as a must-have. Every need can be changed or removed, those too; one you removed stays off the list until you put it back." },
    { audience: "everyone", q: "What is my role, and who chose it?", a: "A role is a group inside your team, with the skills it asks for. Your manager makes the team's roles and puts people in them; nobody gets a role by themselves, and you can be in more than one. Roles shows the roles you are in and the skills each asks for; My skills names them at the top. Who else is in a role is for the team's managers to see. A role belongs to its team only: another team can have a role with the same name, and it is a different role." },
    { audience: "manager", q: "How do I make roles and put people in them?", a: "My team › People and roles. Press New role and name it (SRE, Service desk, Team lead): make as many as the team needs. Each role is a section. Drag a person onto a role to move them there; hold Ctrl while dropping to add them to that role as well. Or tick several people and choose Add them to a role. A person can be in several roles, and stays in at least one once they are in one: take them out of a role only when they are in another, or move them." },
    { audience: "manager", q: "How do I say which skills a role asks for?", a: "In the role's section press Add skills, tick them in the catalogue and choose the level the role asks for. Each skill shows as a chip with its level: press it to change the level, make it a must-have or a nice-to-have, or remove it. Any skill can be removed, must-haves too. If a skill is not in the catalogue, ask for it from the same box: a coordinator approves new skills." },
    { audience: "manager", q: "I changed my team's roles. Why does nothing change for my people?", a: "Every change to roles and needs is a draft first, so you can try things without anyone being affected. My team › Review changes lists what differs from what is in force; take back any line you did not mean, then press Confirm. Only then do people's roles and the skills they are asked for change. Discard all throws the draft away." },
    { audience: "manager", q: "Where would my people also fit?", a: "My team › Fit in other teams lists, for each person who reports to you, the roles of other teams whose skills they already hold at the level asked, with the team and the manager they would be under. A role is listed when the person holds at least half of its skills; an administrator can change that share (Settings › Levels & rules). It shows capability only: whether anyone moves is a conversation." },
    { audience: "everyone", q: "Why does each role have a colour?", a: "Only to tell the roles of a team apart: a role has the same soft colour wherever it shows, on the team's page, beside a person's name and on Roles. A new role gets a colour its team does not use yet. Its manager can choose another (the dot beside the role's name, or its right-click menu › Colour) from a list of tints; none is bright, and the colour says nothing about the role." },
    { audience: "everyone", q: "What does right-click do?", a: "Right-click (or press and hold on a phone) a person, a role, a skill, a team need, a request or a row in a list: a menu shows what you can do with exactly that thing. The same menu is behind the ⋯ button next to it. An action that is not possible is shown greyed, with the reason." },
    { audience: "everyone", q: "Who approves a new skill or category?", a: "A coordinator, or an administrator. Requests names them. They approve it (sometimes with a changed name or category), send it back with a note for you to change it, or say no with a reason. An administrator makes someone a coordinator in Settings › People & access › Accounts." },
    { audience: "manager", q: "What is Insights?", a: "The picture of your team, or (for leaders) any team or the whole organisation: the headline numbers, capability by team and category, where teams are short, the strongest skills, and people who already have what another team is short of. Pick a team at the top right." },
    { audience: "everyone", q: "What is demo mode?", a: "The Demo button at the top, open to everyone, switches your browser to a made-up organisation: the easiest way to learn the app, and for presentations, like a phone's store mode. An orange bar shows it is on; you can be the head of the organisation, a director, a manager, a coordinator, a team member or an administrator. Nothing you do there reaches the real data, and no e-mail is sent. Back to real data switches back; managers and above can also reset the made-up data." },
    { audience: "everyone", q: "What is the Next button at the top?", a: "The one thing that matters most for you to do now: rate your skills, send them, look at ratings sent back; for a manager, confirm ratings, remind people, say what the team needs; for an administrator, what the app still needs. Home lists it with what comes after it. When there is nothing to do, the button is not shown." },
    { audience: "manager", q: "What does the blue dot in the skills grid mean?", a: "The person has sent that rating and it is waiting for you to confirm it. The cell shows their own level in grey italics until you do; hover it for the details, or open My team › To confirm." },
    { audience: "admin", q: "Where is everything set up?", a: "Settings, one section per item of its sub menu: people and access (with coordinators), skills (with CSV upload), levels and rules, ServiceNow, single sign-on, e-mail, data and backups (with Reset), demo, audit log and this help page. Every field has an (i) that says what it does. Roles are not set up here: each manager makes the roles of their own team." },
    { audience: "admin", q: "How do I undo a test round, or start again?", a: "Settings › Data & backups › Reset. Reset one thing: the assessments of everyone, one team or one person; the roles and needs of a team; the requests. Or choose Everything to go back to how the app was first installed: the starter skill catalogue, the shipped level wording and rules, and nothing people did. People, accounts and connections always stay. A backup is taken first each time, so a reset can be undone from the list of backups." },
    { audience: "admin", q: "How do I load a skill catalogue?", a: "A starter catalogue is loaded on the first start: technical skills grouped by technology, and Managerial, Analytical and Business skills. Change it to your own standard in Settings › Skills: add, rename, retire and merge skills and categories one by one, or download the catalogue, change it in a spreadsheet, and upload it again (columns category, skill, sub_skill, aliases, description, status). The upload updates skills that exist by name and adds the new ones; columns left out keep what is there, and nothing is deleted. Check it first: new skills that look like existing ones are listed with a choice (merge, replace, keep both, skip) before anything is saved." },
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
