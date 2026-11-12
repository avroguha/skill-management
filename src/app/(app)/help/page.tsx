// Help: the FAQ (what applies to this person), how to reach the people who run the portal,
// a feedback form, the answers to their own feedback, and the guided tour.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/server";
import { readHelp, FEEDBACK_KINDS, FEEDBACK_STATUS } from "@/lib/help";
import { HelpPage } from "./client";

export const metadata = { title: "Help" };

export default async function Help() {
  const v = await requireViewer();
  const db = await getDb();
  const [help, mine] = await Promise.all([
    readHelp(db),
    db.select().from(schema.feedback).where(eq(schema.feedback.userId, v.userId)).orderBy(desc(schema.feedback.at)).limit(20),
  ]);
  const manager = v.role !== "employee";
  const faq = help.faq.filter((f) => f.audience === "everyone" || (f.audience === "manager" && manager) || (f.audience === "admin" && v.isAdmin));
  return (
    <>
      <PageHeader title="Help" description="Answers to common questions, who to contact, and a way to tell us what is wrong or missing." />
      <HelpPage faq={faq} contact={help.contact} kinds={FEEDBACK_KINDS.map((k) => ({ id: k.id, label: k.label }))}
        mine={mine.map((f) => ({
          id: f.id, at: f.at.toISOString(), kind: FEEDBACK_KINDS.find((k) => k.id === f.kind)?.label ?? f.kind, message: f.message,
          status: FEEDBACK_STATUS[f.status as keyof typeof FEEDBACK_STATUS] ?? f.status, done: f.status === "done", note: f.adminNote,
        }))} />
    </>
  );
}
