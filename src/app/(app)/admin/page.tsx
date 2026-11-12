import Link from "next/link";
import { count, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const db = await getDb();
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [units, people, skills, drafts, roles, users, sso, open, keys, fresh] = await Promise.all([
    n(db.select({ n: count() }).from(schema.orgUnit)),
    n(db.select({ n: count() }).from(schema.employee).where(eq(schema.employee.active, true))),
    n(db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "active"))),
    n(db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "draft"))),
    n(db.select({ n: count() }).from(schema.jobRole)),
    n(db.select({ n: count() }).from(schema.user)),
    n(db.select({ n: count() }).from(schema.ssoProvider)),
    n(db.select({ n: count() }).from(schema.assessmentCycle).where(eq(schema.assessmentCycle.status, "open"))),
    n(db.select({ n: count() }).from(schema.apiClient).where(isNull(schema.apiClient.revokedAt))),
    n(db.select({ n: count() }).from(schema.feedback).where(eq(schema.feedback.status, "new"))),
  ]);
  const cards = [
    { href: "/admin/org", title: "Organisation", stat: `${units} units · ${people} people`, text: "The unit tree, who manages what, and the people in it." },
    { href: "/admin/taxonomy", title: "Taxonomy", stat: `${skills} skills${drafts ? ` · ${drafts} suggested` : ""}`, text: "Categories, skills and sub-skills. Approve suggestions, merge duplicates.", flag: drafts > 0 },
    { href: "/admin/roles", title: "Roles & targets", stat: `${roles} roles`, text: "What each role and grade needs, at what level." },
    { href: "/admin/levels", title: "Levels", stat: "0–5", text: "The wording of each proficiency level." },
    { href: "/admin/cycles", title: "Cycles", stat: open ? "one open" : "none open", text: "Assessment rounds with a due date." },
    { href: "/admin/users", title: "Users & access", stat: `${users} accounts`, text: "Who can sign in, what they can see, and local passwords." },
    { href: "/admin/sso", title: "Single sign-on", stat: sso ? `${sso} provider${sso === 1 ? "" : "s"}` : "not set up", text: "SAML 2.0 with the company identity provider." },
    { href: "/admin/integrations", title: "Integrations", stat: keys ? `${keys} key${keys === 1 ? "" : "s"}` : "none", text: "Power BI, Tableau, Excel: a key per tool, limited to the data you choose." },
    { href: "/admin/feedback", title: "Help & feedback", stat: fresh ? `${fresh} new` : "nothing new", text: "What people report, your replies, the FAQ and contact details.", flag: fresh > 0 },
    { href: "/admin/data", title: "Import & export", stat: "CSV", text: "Load people, skills, roles and ratings in bulk; take them out again." },
    { href: "/admin/settings", title: "Settings", stat: "", text: "When a rating goes stale, and the colour thresholds." },
    { href: "/admin/audit", title: "Audit log", stat: "", text: "Every change, who made it and when." },
  ];
  return (
    <>
      <PageHeader title="Admin" description="Set up the organisation, the skills and who can see what." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{c.title}</span>
              <span className={c.flag ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>{c.stat}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
