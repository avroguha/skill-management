// Help: the questions people ask (what applies to this person), how the numbers work, and
// how to reach the people who run the app.
import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/server";
import { readHelp } from "@/lib/help";
import { HelpPage } from "./client";

export const metadata = { title: "Help" };

export default async function Help() {
  const v = await requireViewer();
  const help = await readHelp(await getDb());
  const manager = v.role !== "employee";
  const faq = help.faq.filter((f) => f.audience === "everyone" || (f.audience === "manager" && manager) || (f.audience === "admin" && v.isAdmin));
  return (
    <>
      <PageHeader title="Help" description="Answers to common questions, how the numbers work, and who to contact." />
      <HelpPage faq={faq} contact={help.contact} />
    </>
  );
}
