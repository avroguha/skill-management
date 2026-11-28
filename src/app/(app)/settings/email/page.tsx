import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/server";
import { getLevels, levelNamer } from "@/lib/levels";
import { readEmailSettings, recentEmails, appUrl } from "@/lib/mail/notify";
import { previewEmails } from "@/lib/mail/preview";
import { EmailForm } from "./form";
import { EmailPreview } from "./preview";

export const metadata = { title: "E-mail · Settings" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  test: "Test", submitted: "Sent to confirm", returned: "Sent back", validated: "Confirmed", reminder: "Weekly reminder", nudge: "Manager’s reminder", digest: "Manager’s weekly digest",
};

export default async function EmailSettingsPage() {
  const v = await requireAdmin();
  const db = await getDb("live");
  const [settings, recent, levels] = await Promise.all([readEmailSettings(db), recentEmails(db, 200), getLevels()]);
  const previews = previewEmails({ appUrl: appUrl(), levelName: levelNamer(levels), orgName: process.env.ORG_NAME || "Skills" });
  return (
    <>
      <PageHeader title="E-mail"
        description="The company mail relay, and what the app tells people: managers when ratings wait for them, people when theirs are confirmed or sent back, and weekly reminders." />
      <div className="grid gap-5">
        <Section title="Mail relay and e-mails" info="Nothing is sent until “Send e-mail” is on and saved. Try the relay with a test first.">
          <EmailForm initial={settings} adminEmail={v.employee?.email || v.email} appUrl={appUrl()} readOnly={!!v.demo} />
        </Section>
        <Section title="Preview" info="Every e-mail the app sends, filled in with made-up content, exactly as it is built: the HTML most mail clients show, and the plain text for those that do not.">
          <EmailPreview items={previews} />
        </Section>
        <Section title="Recent e-mails" info="The latest 200, newest first. A failed one is tried three times, ten minutes apart; the relay’s answer is kept here.">
          <DataTable csvName="emails" pageSize={20}
            rows={recent.map((m) => ({
              at: m.createdAt.toISOString(), when: m.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
              kind: KIND[m.kind] ?? m.kind, to: m.toName ? `${m.toName} <${m.toEmail}>` : m.toEmail, subject: m.subject,
              status: m.status === "pending" && m.attempts ? "retrying" : m.status, error: m.error,
            }))}
            searchKeys={["to", "subject", "error"]}
            columns={[
              { key: "when", header: "When", kind: "muted", sortable: false },
              { key: "kind", header: "E-mail", facet: true },
              { key: "to", header: "To" },
              { key: "subject", header: "Subject", kind: "muted" },
              { key: "status", header: "Status", kind: "badge", facet: true, info: "pending: waiting to go (returns and confirmations wait two minutes to batch a sitting); sent: the relay accepted it; retrying / failed: the relay refused or did not answer." },
              { key: "error", header: "Relay’s answer", kind: "muted", className: "max-w-80 truncate text-xs" },
            ]} />
        </Section>
      </div>
    </>
  );
}
