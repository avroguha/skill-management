// Settings › Overview: what is set up and what is left, each one click from its section, and
// what came across from version 1.
import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { CircleCheck, CircleDashed, ArrowRight } from "lucide-react";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { Info } from "@/components/info";
import { getEngine, getViewer } from "@/lib/server";
import { readSsoSettings } from "@/lib/sso-gate";
import { readDirectoryConfig } from "@/lib/directory/config";
import { readEmailSettings } from "@/lib/mail/notify";
import { IMPORT_KEY, type ImportSummary } from "@/lib/import-v1";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Settings" };

export default async function SettingsHome() {
  const v = await getViewer();
  const db = await getDb();
  const engine = await getEngine();
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const [skills, requests, coordinators, sso, dir, email, lastSync, imported] = await Promise.all([
    n(db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "active"))),
    n(db.select({ n: count() }).from(schema.catalogueRequest).where(eq(schema.catalogueRequest.status, "pending"))),
    n((await getDb("live")).select({ n: count() }).from(schema.user).where(eq(schema.user.role, "coordinator"))),
    readSsoSettings(db),
    readDirectoryConfig(db),
    readEmailSettings(db),
    db.select().from(schema.syncRun).orderBy(desc(schema.syncRun.startedAt)).limit(1),
    db.select().from(schema.appSetting).where(eq(schema.appSetting.key, IMPORT_KEY)),
  ]);
  const people = engine.activeEmployees;
  const managers = people.filter(engine.isManager).length;
  const asked = people.filter(engine.assesses);
  const withRole = asked.filter((e) => e.roleIds.length).length;
  const teamsWithRoles = new Set(engine.roles.map((r) => r.managerId)).size;
  const sync = lastSync[0];
  const summary = imported[0]?.value as ImportSummary | undefined;

  const steps: { done: boolean; title: string; text: string; href: string; info: string }[] = [
    { done: people.length > 0, href: "/settings/servicenow", title: "People and their managers",
      text: people.length ? `${people.length} people, ${managers} managers${dir.enabled ? ` · synced from ServiceNow${sync ? ` ${fmtDate(sync.startedAt)} (${sync.status})` : ""}` : ""}` : "Nobody yet: sync from ServiceNow, or upload a people CSV in Data & backups.",
      info: "People and who reports to whom. A team is a manager and everyone below them, so the reporting lines are the organisation." },
    { done: sso.active, href: "/settings/sso", title: "Single sign-on",
      text: sso.active ? "Active: people sign in with their company account." : "Not active: only local accounts can sign in.",
      info: "Company sign-in (SAML 2.0). Only active people from ServiceNow can sign in with it. The local admin account always keeps working." },
    { done: skills > 0, href: "/settings/skills", title: "Skill catalogue",
      text: skills ? `${skills} skills.` : "Empty: upload a CSV of skills, or go back to the starter catalogue in Data & backups.",
      info: "Categories, skills and sub-skills people rate themselves on: the same for everyone. Upload a CSV, or add them one by one. Managers and everyone else ask for what is missing (Requests)." },
    { done: coordinators > 0 || !!v?.demo, href: "/settings/people", title: "Coordinators for new skills",
      text: `${coordinators ? `${coordinators} coordinator${coordinators === 1 ? "" : "s"}` : v?.demo ? "The demo has a coordinator (switch to them in the orange bar)" : "No coordinator yet: only administrators can approve"} · ${requests} request${requests === 1 ? "" : "s"} waiting.`,
      info: "A coordinator approves requests for new skills and categories, sends them back with a note, or says no with a reason. Name one or a few under People & access › Accounts: set their access to Coordinator. Administrators can always decide too." },
    { done: withRole > 0, href: "/team", title: "Teams have made their roles",
      text: `${teamsWithRoles} of ${managers} teams have roles (${engine.roles.length} in all) · ${withRole} of ${asked.length} people who rate themselves are in a role.`,
      info: "A role is a group a manager makes inside their own team, with the skills it asks for. Managers make them on My team › People and roles; nobody gets a role by themselves. People in no role have no targets: they can still rate skills, but no gap is shown for them." },
    { done: email.enabled, href: "/settings/email", title: "E-mail",
      text: email.enabled ? "On: managers hear when ratings wait for them; people get reminders." : "Off: nobody is told when something waits for them.",
      info: "Through the company mail relay. Tells managers when ratings wait for them, people when their ratings are confirmed or sent back, and sends weekly reminders and a manager digest." },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Everything the app needs, one section each: they are the sub menu under Settings in the menu. Every field has an (i) that says what it does." />
      {v?.demo && <p className="mb-4 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Demo mode: these are the demo&apos;s settings. Single sign-on, ServiceNow, e-mail, accounts and backups only change for real, so they are read-only here.</p>}
      <div className="grid gap-5">
        <Section title="Setup" info="The five things the app needs to be useful, in order. Each opens its section.">
          <ol className="grid gap-2">
            {steps.map((s) => (
              <li key={s.title}>
                <Link href={s.href} className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50">
                  {s.done ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-status-meets-fg dark:text-emerald-400" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">{s.title}<Info label={`About ${s.title}`}>{s.info}</Info></span>
                    <span className="text-sm text-muted-foreground">{s.text}</span>
                  </span>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ol>
        </Section>
        {summary && (
          <Section title="Brought over from version 1" info="On its first start, version 2 copied everything that still has a meaning from the version-1 database, which it left unchanged. Units became teams (a unit's needs became its manager's team needs); what version 2 no longer has was left in the version-1 database.">
            <p className="text-sm">{summary.source ? `From ${summary.source}, ${fmtDate(summary.at)}.` : summary.note}</p>
            {summary.source && (
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(summary.copied).filter(([, c]) => c > 0).map(([t, c]) => (
                  <div key={t} className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.replace(/_/g, " ")}</dt><dd className="tabular">{c}</dd></div>
                ))}
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">team needs (from units)</dt><dd className="tabular">{summary.converted.teamNeeds}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">team names (from units)</dt><dd className="tabular">{summary.converted.teamNames}</dd></div>
              </dl>
            )}
            {Object.keys(summary.leftBehind).length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Left in the version-1 database: {Object.entries(summary.leftBehind).map(([k, c]) => `${c} ${k}`).join(", ")}.</p>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
