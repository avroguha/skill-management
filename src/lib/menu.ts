// The menu: one description of where everything is. The sidebar (menu and sub menus), the
// "you are here" trail in the header, the sub menu a page shows when the sidebar is closed,
// the "What do you want to do?" list on Home and the Find box are all drawn from it, so
// they can never disagree. Pure: who is looking in, the menu out (test/menu.test.ts).

export type MenuIcon = "home" | "assess" | "team" | "insights" | "people" | "org" | "roles" | "skills" | "requests" | "admin" | "help";

/** One line of a sub menu: a section of a page (what used to be a tab). */
export interface SubItem {
  key: string;
  label: string;
  /** what is behind it, in a few words */
  hint: string;
  href: string;
  /** a count to show next to it */
  badge?: number | string;
  /** the count is something waiting to be done */
  attention?: boolean;
}

export interface MenuItem {
  key: string;
  label: string;
  /** what is behind it, in a few words: the second line of the menu entry */
  hint: string;
  href: string;
  icon: MenuIcon;
  badge?: number;
  sub?: SubItem[];
  /** the query parameter that says which sub item is open; without it the address does */
  subParam?: string;
  /** the sub menu is open from the start, not only once the page is */
  open?: boolean;
}

export interface MenuGroup { key: string; label: string; items: MenuItem[] }

/** What the menu depends on: who is looking and what waits for them. */
export interface MenuFor {
  /** they are a person in the organisation (not only an account) */
  hasProfile: boolean;
  /** they manage people */
  isManager: boolean;
  /** they may see teams other than their own position: managers, leaders, administrators */
  canSeeTeams: boolean;
  isAdmin: boolean;
  /** ratings waiting for them to confirm */
  waiting?: number;
  /** approves requests for new skills and categories (a coordinator or an administrator) */
  coordinator?: boolean;
  /** requests waiting for a coordinator: shown to coordinators */
  requestsWaiting?: number;
  /** their own requests that came back to be changed */
  requestsReturned?: number;
  /** changes to their own team's roles and needs that are not confirmed yet */
  teamChanges?: number;
}

/** The sections of a team's page. */
export const TEAM_SECTIONS = [
  { key: "confirm", label: "To confirm", hint: "Ratings your people sent you" },
  { key: "people", label: "People and roles", hint: "The team's roles, who is in each, the skills each asks for" },
  { key: "needs", label: "Team needs", hint: "The skills the team must have" },
  { key: "grid", label: "Skills grid", hint: "Everyone against every skill" },
  { key: "fit", label: "Fit in other teams", hint: "Where your people's skills also match" },
  { key: "review", label: "Review changes", hint: "Changes to roles and needs, not confirmed yet" },
] as const;
export type TeamSection = (typeof TEAM_SECTIONS)[number]["key"];

/** The sections of Requests. The last two are for coordinators and administrators. */
export const REQUEST_SECTIONS = [
  { key: "mine", label: "My requests", hint: "What you asked for and where it is", approver: false },
  { key: "approve", label: "To approve", hint: "Requests waiting for a coordinator", approver: true },
  { key: "all", label: "All requests", hint: "Everything asked for, and what was decided", approver: true },
] as const;
export type RequestSection = (typeof REQUEST_SECTIONS)[number]["key"];

/** The sections of Settings. */
export const SETTINGS_SECTIONS = [
  { href: "/settings", label: "Overview", hint: "What is set up, what is left" },
  { href: "/settings/people", label: "People & access", hint: "Accounts, administrators, coordinators" },
  { href: "/settings/skills", label: "Skills", hint: "The catalogue, CSV upload" },
  { href: "/settings/levels", label: "Levels & rules", hint: "The 0-5 wording, colours, stale, team match" },
  { href: "/settings/servicenow", label: "ServiceNow", hint: "Where people come from" },
  { href: "/settings/sso", label: "Single sign-on", hint: "Company sign-in (SAML)" },
  { href: "/settings/email", label: "E-mail", hint: "Relay, alerts, reminders" },
  { href: "/settings/data", label: "Data & backups", hint: "CSV, backups, reset" },
  { href: "/settings/demo", label: "Demo", hint: "Made-up data for presenting" },
  { href: "/settings/help", label: "Help page", hint: "FAQ and contact" },
  { href: "/settings/audit", label: "Audit log", hint: "Who changed what" },
] as const;

export function buildMenu(f: MenuFor): MenuGroup[] {
  const groups: MenuGroup[] = [
    { key: "start", label: "Menu", items: [{ key: "home", label: "Home", hint: "Your next step and the numbers", href: "/", icon: "home" }] },
  ];

  // a team's page: "My team" under My work for a manager; for a leader or an administrator,
  // who have no team of their own, "Teams" with the rest of the organisation
  const team: MenuItem | null = f.canSeeTeams ? {
    key: "team", label: f.isManager ? "My team" : "Teams", hint: f.isManager ? "Your people and their skills" : "Any team and its skills",
    href: "/team", icon: "team", badge: f.waiting || undefined, subParam: "tab",
    // a manager's own team: its sections are in view from the start
    open: f.isManager,
    sub: TEAM_SECTIONS.map((s) => ({
      key: s.key, label: s.label, hint: s.hint, href: `/team?tab=${s.key}`,
      ...(s.key === "confirm" && f.waiting ? { badge: f.waiting, attention: true } : {}),
      ...(s.key === "review" && f.teamChanges ? { badge: f.teamChanges, attention: true } : {}),
    })),
  } : null;

  const mine: MenuItem[] = [];
  if (f.hasProfile) mine.push({ key: "my-skills", label: "My skills", hint: "Rate yourself, 0 to 5", href: "/my-skills", icon: "assess" });
  if (team && f.isManager) mine.push(team);
  if (mine.length) groups.push({ key: "mine", label: "My work", items: mine });

  if (f.canSeeTeams) {
    groups.push({ key: "org", label: "The organisation", items: [
      ...(team && !f.isManager ? [team] : []),
      { key: "insights", label: "Insights", hint: "Where teams are strong and short", href: "/insights", icon: "insights" },
      { key: "people", label: "People", hint: "Find a person and their skills", href: "/people", icon: "people" },
      { key: "org", label: "Org chart", hint: "Who reports to whom", href: "/org", icon: "org" },
    ] });
  }

  const requestSections = REQUEST_SECTIONS.filter((s) => !s.approver || f.coordinator);
  groups.push({ key: "catalogue", label: "Roles and skills", items: [
    { key: "roles", label: "Roles", hint: f.canSeeTeams ? "Each team's roles and their skills" : "Your roles and what they ask for", href: "/roles", icon: "roles" },
    { key: "skills", label: "Skills", hint: f.canSeeTeams ? "The catalogue, and who has what" : "The catalogue and the levels", href: "/skills", icon: "skills" },
    {
      key: "requests", label: "Requests", hint: f.coordinator ? "New skills waiting for approval" : "Ask for a new skill or category", href: "/requests", icon: "requests",
      badge: (f.coordinator ? f.requestsWaiting : f.requestsReturned) || undefined,
      // one section only: nothing to choose between, so no sub menu
      ...(requestSections.length > 1 ? {
        subParam: "tab",
        sub: requestSections.map((s) => ({
          key: s.key, label: s.label, hint: s.hint, href: `/requests?tab=${s.key}`,
          ...(s.key === "approve" && f.requestsWaiting ? { badge: f.requestsWaiting, attention: true } : {}),
          ...(s.key === "mine" && f.requestsReturned ? { badge: f.requestsReturned, attention: true } : {}),
        })),
      } : {}),
    },
  ] });

  if (f.isAdmin) {
    groups.push({ key: "admin", label: "Administration", items: [{
      key: "settings", label: "Settings", hint: "People, skills, sign-in, e-mail", href: "/settings", icon: "admin",
      sub: SETTINGS_SECTIONS.map((s) => ({ key: s.href, label: s.label, hint: s.hint, href: s.href })),
    }] });
  }

  groups.push({ key: "help", label: "Help", items: [{ key: "help", label: "Help", hint: "Questions, answers, who to ask", href: "/help", icon: "help" }] });
  return groups;
}

const pathOf = (href: string) => href.split("?")[0]!;
const under = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export interface Located { group: MenuGroup; item: MenuItem; sub: SubItem | null }

/** Where an address is in the menu: its group, its entry and (where the page has sections) its sub item. */
export function locate(groups: MenuGroup[], pathname: string, param: (name: string) => string | null = () => null): Located | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (!under(pathname, item.href)) continue;
      let sub: SubItem | null = null;
      if (item.sub) {
        if (item.subParam) sub = item.sub.find((s) => s.key === param(item.subParam!)) ?? null;
        else {
          // the longest address that fits; the section's own address (its overview) only when exact
          for (const s of item.sub) {
            const p = pathOf(s.href);
            const fits = p === item.href ? pathname === p : under(pathname, p);
            if (fits && (!sub || p.length > pathOf(sub.href).length)) sub = s;
          }
        }
      }
      return { group, item, sub };
    }
  }
  return null;
}

/** A thing someone may want to do, in their own words, and where it is done. */
export interface Task { key: string; text: string; href: string; group: string; words?: string }

/** Everything this person can do, grouped like the menu: the answer to "where do I ...?". */
export function tasksFor(f: MenuFor): Task[] {
  const out: Task[] = [];
  const add = (group: string, key: string, text: string, href: string, words = "") => out.push({ key, text, href, group, words });
  if (f.hasProfile) {
    add("My work", "rate", "Rate my skills", "/my-skills", "self assessment level update");
    add("My work", "add-skill", "Add a skill I have that is not on my list", "/my-skills", "new");
    add("My work", "my-status", "See what my manager confirmed or sent back", "/my-skills", "returned note validated");
  }
  if (f.isManager) {
    add("My team", "confirm", "Confirm the ratings my people sent", "/team?tab=confirm", "approve validate review send back");
    add("My team", "make-role", "Make a role in my team", "/team?tab=people", "create add role group section");
    add("My team", "put-in-role", "Put people in a role, or move them to another", "/team?tab=people", "assign member drag drop add remove");
    add("My team", "role-skills", "Choose the skills a role asks for", "/team?tab=people", "add remove skill level must have");
    add("My team", "review", "Review and confirm the changes I made", "/team?tab=review", "draft pending undo discard confirm");
    add("My team", "remind", "See who has not rated yet, and remind them", "/team?tab=people", "progress nudge e-mail email not started");
    add("My team", "needs", "Say which skills my team needs", "/team?tab=needs", "demand headcount short cover must have");
    add("My team", "grid", "See my whole team's skills side by side", "/team?tab=grid", "heatmap matrix grid");
    add("My team", "fit", "See where my people would also fit in another team", "/team?tab=fit", "match other team manager move percent");
  } else if (f.canSeeTeams) {
    add("Teams", "open-team", "Open a team and see its people and skills", "/team?tab=people", "manager team");
    add("Teams", "team-needs", "See what a team needs and where it is short", "/team?tab=needs", "demand cover");
  }
  if (f.canSeeTeams) {
    add("The organisation", "short", "See where teams are short of a skill", "/insights", "gap risk one person coverage");
    add("The organisation", "find-person", "Find a person and see their skills", "/people", "search employee profile");
    add("The organisation", "who-has", "Find everyone who has a skill", "/people", "expert holder who knows");
    add("The organisation", "org", "See who reports to whom", "/org", "org chart manager hierarchy");
  }
  add("Roles and skills", "role-asks", f.canSeeTeams ? "See which skills a role asks for" : "See which skills my roles ask for", "/roles", "targets team role");
  add("Roles and skills", "catalogue", "Look through the skill catalogue", "/skills", "list categories");
  add("Roles and skills", "ask-skill", "Ask for a new skill or a new category", "/requests", "request missing add suggest");
  add("Roles and skills", "my-requests", "See where my requests are, and with whom", "/requests", "pending approved returned rejected status");
  if (f.coordinator) add("Roles and skills", "approve", "Approve, send back or refuse requests for new skills", "/requests?tab=approve", "coordinator decide reject return");
  if (f.isAdmin) {
    add("Administration", "bring-people", "Bring people in from ServiceNow", "/settings/servicenow", "sync directory import users");
    add("Administration", "skills-admin", "Add, change or upload skills and categories", "/settings/skills", "csv catalogue merge retire");
    add("Administration", "accounts", "Give someone an account, or make them an administrator or a coordinator", "/settings/people", "access user password approver");
    add("Administration", "sso", "Switch on company sign-in", "/settings/sso", "sso saml azure entra single sign-on");
    add("Administration", "email", "Switch on e-mail and reminders", "/settings/email", "smtp relay notification");
    add("Administration", "backup", "Download a backup, or restore one", "/settings/data", "export csv restore");
    add("Administration", "levels", "Change the level names and colours", "/settings/levels", "0-5 wording stale rules");
    add("Administration", "fit-percent", "Change how much of a role's skills count as a match", "/settings/levels", "fit percent 50 other team");
    add("Administration", "fit-show", "Show or hide to people which other teams they would fit in", "/settings/levels", "fit visible associates members see hide");
    add("Administration", "reset", "Reset ratings or a team, or go back to how the app was installed", "/settings/data", "revert out of the box oob clear start over");
    add("Administration", "audit", "See who changed what", "/settings/audit", "log history");
  }
  add("Help", "help", "Read the questions and answers", "/help", "faq contact support");
  return out;
}
