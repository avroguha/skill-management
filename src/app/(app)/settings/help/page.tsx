import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { readHelp } from "@/lib/help";
import { FaqEditor, ContactEditor } from "./client";

export const metadata = { title: "Help page · Settings" };

export default async function HelpSettings() {
  const help = await readHelp(await getDb());
  return (
    <>
      <PageHeader title="Help page" description="What the Help page says: the questions people ask, and how to reach you." />
      <div className="grid gap-5">
        <FaqEditor help={help} />
        <ContactEditor help={help} />
      </div>
    </>
  );
}
