import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/server";
import { readEmailSettings, recentEmails, appUrl } from "@/lib/mail/notify";
import { EmailForm } from "./form";

export const metadata = { title: "Email · Admin" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  test: "Test", submitted: "Sent for validation", returned: "Sent back", validated: "Validated", reminder: "Reminder", nudge: "Manager's reminder",
};

export default async function EmailAdmin() {
  const v = await requireAdmin();
  const db = await getDb();
  const [settings, recent] = await Promise.all([readEmailSettings(db), recentEmails(db, 200)]);
  return (
    <>
      <PageHeader title="Email"
        description="The company mail relay, and which e-mails the app sends: approvals to managers, and to people when their ratings are sent back or validated, and reminders while an assessment round is open." />
      <div className="grid gap-5">
        <Section title="Mail relay and e-mails">
          <EmailForm initial={settings} adminEmail={v.employee?.email || v.email} appUrl={appUrl()} />
        </Section>
        <Section title="Recent e-mails" description="The latest 200, newest first. A failed one is tried three times; the relay's answer is kept.">
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
              { key: "status", header: "Status", kind: "badge", facet: true },
              { key: "error", header: "Relay's answer", kind: "muted", className: "max-w-80 truncate text-xs" },
            ]} />
        </Section>
      </div>
    </>
  );
}
