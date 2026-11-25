import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/server";
import { SubMenu } from "@/components/sub-menu";
import { SETTINGS_SECTIONS } from "@/lib/menu";

// The sections of Settings are a sub menu under Settings in the menu. With the menu closed
// (or on a phone) the same sub menu sits at the top of the page.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const db = await getDb();
  const [{ n: drafts }] = await db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.status, "draft"));
  return (
    <>
      <SubMenu label="Settings" items={SETTINGS_SECTIONS.map((s) => ({
        key: s.href, label: s.label, href: s.href, hint: s.hint,
        ...(s.href === "/settings/skills" && Number(drafts) ? { count: Number(drafts), attention: true } : {}),
      }))} />
      {children}
    </>
  );
}
