import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/server";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const db = await getDb();
  const [{ n: drafts }] = await db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "draft"));
  return (
    <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-16 lg:self-start">
        <SettingsNav flags={{ "/settings/skills": drafts ? `${drafts} to approve` : undefined }} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
