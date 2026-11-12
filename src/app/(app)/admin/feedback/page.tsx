// Admin › Help & feedback: what people sent (newest first, open ones on top), with a status
// and a reply they see on their Help page; and the FAQ and contact details everyone sees.
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/server";
import { readHelp, FEEDBACK_KINDS } from "@/lib/help";
import { FeedbackAdmin } from "./client";

export const metadata = { title: "Help & feedback" };

export default async function FeedbackPage() {
  await requireAdmin();
  const db = await getDb();
  const [rows, help] = await Promise.all([
    db.select().from(schema.feedback).orderBy(desc(schema.feedback.at)).limit(500),
    readHelp(db),
  ]);
  const order = { new: 0, in_progress: 1, done: 2 } as Record<string, number>;
  return (
    <>
      <PageHeader title="Help & feedback" description="What people tell you, and what they see on the Help page." />
      <FeedbackAdmin help={help}
        items={rows.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || b.at.getTime() - a.at.getTime()).map((f) => ({
          id: f.id, at: f.at.toISOString(), name: f.name, email: f.email, kind: FEEDBACK_KINDS.find((k) => k.id === f.kind)?.label ?? f.kind,
          message: f.message, page: f.page, status: f.status, note: f.adminNote, handledBy: f.handledBy ?? "",
          handledAt: f.handledAt?.toISOString() ?? null,
        }))} />
    </>
  );
}
