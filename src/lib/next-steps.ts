// The next step for whoever is looking: what matters most for them to do now, then what
// after. Worked out from who they are (someone rating their own skills, a manager, a leader,
// an administrator) and what is waiting; shown in the header of every page and at the top of
// Home. Pure: the engine and a few setup facts in, a list out (test/next-steps.test.ts).
import { ALL, type Engine } from "./engine/engine.ts";
import type { Access } from "./access.ts";

export interface NextStep {
  key: string;
  /** a short instruction, e.g. "Confirm 9 ratings from 3 people" */
  title: string;
  /** one line on why, or what it involves */
  detail: string;
  href: string;
  /** the button's words */
  action: string;
  /** "do" = something to do; "info" = all done or waiting on someone else */
  kind: "do" | "info";
}

/** Setup facts only an administrator's steps need (read from the database by the caller). */
export interface SetupFacts { ssoActive: boolean; emailOn: boolean; draftSkills: number; skills: number }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function nextSteps(engine: Engine, v: Pick<Access, "role" | "allPeople" | "homeScope"> & { employee: { id: string } | null; isAdmin: boolean }, setup?: SetupFacts | null): NextStep[] {
  const out: NextStep[] = [];
  const me = v.employee ? engine.empById.get(v.employee.id) : undefined;

  // ---- my own skills
  if (me && engine.assesses(me)) {
    const p = engine.progress(me);
    const mgr = me.managerId ? engine.empById.get(me.managerId)?.name.split(" ")[0] : undefined;
    if (p.state === "sent_back") {
      out.push({ key: "sent-back", kind: "do", href: "/my-skills", action: "Look at them",
        title: `Look at the ${plural(p.returned, "rating")} ${mgr ?? "your manager"} sent back`, detail: "Read the note, change the level or add a line, then send it again." });
    } else if (p.state === "not_started") {
      out.push({ key: "rate", kind: "do", href: "/my-skills", action: "Start rating",
        title: `Rate your skills`, detail: p.required ? `${plural(p.required, "skill")} your role asks for, 0 to 5. It takes a few minutes.` : "Add the skills you have, 0 to 5." });
    } else if (p.state === "in_progress") {
      const left = p.required - p.rated;
      out.push(left > 0
        ? { key: "finish", kind: "do", href: "/my-skills", action: "Carry on", title: `Rate the ${plural(left, "skill")} still missing`, detail: `${p.rated} of ${p.required} rated so far. Then send them to ${mgr ?? "your manager"}.` }
        : { key: "send", kind: "do", href: "/my-skills", action: "Open my skills", title: `Send your ratings to ${mgr ?? "your manager"}`, detail: `${plural(p.drafts, "rating")} saved but not sent yet.` });
    }
  }

  // ---- my team (the people reporting to me)
  if (me && engine.isManager(me)) {
    const direct = engine.directReportsOf(me.id);
    const waitingPeople = direct.filter((e) => engine.ratingsOf(e.id).some((r) => r.status === "submitted"));
    const waiting = waitingPeople.reduce((t, e) => t + engine.ratingsOf(e.id).filter((r) => r.status === "submitted").length, 0);
    if (waiting) {
      out.unshift({ key: "confirm", kind: "do", href: "/team?tab=confirm", action: "Review and confirm",
        title: `Confirm ${plural(waiting, "rating")} from ${plural(waitingPeople.length, "person", "people")}`, detail: "Agree with each level, change it, or send it back with a note." });
    }
    const notStarted = direct.filter((e) => engine.progress(e).state === "not_started");
    if (notStarted.length) {
      out.push({ key: "remind", kind: "do", href: "/team?tab=people", action: "Remind them",
        title: `Remind ${plural(notStarted.length, "person", "people")} who have not started`, detail: notStarted.slice(0, 3).map((e) => e.name).join(", ") + (notStarted.length > 3 ? ` and ${notStarted.length - 3} more` : "") });
    }
    // people in the team who are asked to rate but have no role: nothing is asked of them yet
    const noRole = direct.filter((e) => engine.assesses(e) && !e.roleId);
    if (noRole.length) {
      out.push({ key: "team-role", kind: "do", href: "/team?tab=people", action: "Choose a role",
        title: noRole.length === direct.length ? "Choose a role for your team" : `Give ${plural(noRole.length, "person", "people")} in your team a role`,
        detail: "The role says which skills they are asked to rate. Pick one under your team's name, or add a new one." });
    }
    const needs = engine.demands(me.id);
    if (!needs.some((d) => d.explicit)) {
      out.push({ key: "needs", kind: "do", href: "/team?tab=needs", action: "Add a need",
        title: "Say what your team needs", detail: "The skills it depends on, at what level, and how many people. The app then shows where it is short." });
    } else {
      const short = needs.map(engine.coverage).filter((c) => c.shortfall > 0 || c.spof);
      if (short.length) out.push({ key: "short", kind: "do", href: "/team?tab=needs", action: "See who has them",
        title: `${plural(short.length, "team need")} ${short.length === 1 ? "is" : "are"} short or rest on one person`, detail: "See who elsewhere in the organisation already has them." });
    }
  }

  // ---- leaders: the organisation
  if (v.allPeople && v.role !== "admin") {
    const k = engine.kpis(ALL);
    if (k.asked && (k.donePct ?? 0) < 85) {
      out.push({ key: "org-done", kind: "do", href: "/insights", action: "See where",
        title: `${k.donePct ?? 0}% of people have finished rating their skills`, detail: "Until most have, the numbers describe part of the organisation. Insights shows which teams lag." });
    }
    if (k.short) out.push({ key: "org-short", kind: "do", href: "/insights", action: "Open insights",
      title: `${plural(k.short, "team need")} ${k.short === 1 ? "is" : "are"} short across the organisation`, detail: `${k.nobody} with nobody at all. Insights shows who elsewhere already has them.` });
  }

  // ---- administrators: what the app still needs
  if (v.isAdmin) {
    const people = engine.activeEmployees.length;
    if (!people) out.push({ key: "people", kind: "do", href: "/settings/servicenow", action: "Set up ServiceNow", title: "Bring people in", detail: "From ServiceNow (with their managers), or a people CSV in Data & backups." });
    if (setup && !setup.skills) out.push({ key: "skills", kind: "do", href: "/settings/skills", action: "Upload skills", title: "Load the skill catalogue", detail: "Upload a CSV, or download the starter catalogue to begin from." });
    const noRole = engine.activeEmployees.filter((e) => engine.assesses(e) && !e.roleId).length;
    if (people && noRole) out.push({ key: "roles", kind: "do", href: "/settings/people", action: "Give roles", title: `${plural(noRole, "person has", "people have")} no role`, detail: "Their manager chooses the team's role on My team; you can also give roles in People & access, or from designations (ServiceNow)." });
    if (setup?.draftSkills) out.push({ key: "drafts", kind: "do", href: "/settings/skills", action: "Review", title: `Approve or merge ${plural(setup.draftSkills, "suggested skill")}`, detail: "People suggested them while rating; they can rate them once approved." });
    if (setup && !setup.ssoActive) out.push({ key: "sso", kind: "do", href: "/settings/sso", action: "Set up", title: "Switch on single sign-on", detail: "So people sign in with their company account." });
    if (setup && !setup.emailOn) out.push({ key: "email", kind: "do", href: "/settings/email", action: "Set up", title: "Switch on e-mail", detail: "So managers hear when ratings wait for them, and people get reminders." });
  }

  // ---- nothing to do
  if (!out.length) {
    const waitingOnManager = me ? engine.ratingsOf(me.id).filter((r) => r.status === "submitted").length : 0;
    if (waitingOnManager) out.push({ key: "waiting", kind: "info", href: "/my-skills", action: "Open my skills", title: `${plural(waitingOnManager, "rating")} wait for your manager`, detail: "Nothing for you to do: you get an e-mail when they are confirmed." });
    else if (me) out.push({ key: "done", kind: "info", href: "/my-skills", action: "Open my skills", title: "You are up to date", detail: "Keep your skills current as you learn: add new ones, star the ones you want to grow in." });
    else out.push({ key: "explore", kind: "info", href: "/skills", action: "Open skills", title: "Nothing waits for you", detail: "Look around the skill catalogue, or see who has which skill under People." });
  }
  return out;
}
