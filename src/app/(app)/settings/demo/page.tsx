// Settings › Demo: what demo mode is, who can use it, and a way in (and, in it, a reset).
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { getViewer, DEMO_PERSONAS } from "@/lib/server";
import { DemoControls } from "./client";

export const metadata = { title: "Demo · Settings" };
export const dynamic = "force-dynamic";

export default async function DemoSettings() {
  const v = await getViewer();
  const demo = await getDb("demo");
  const [[{ n: people }], [{ n: ratings }]] = await Promise.all([
    demo.select({ n: count() }).from(schema.employee),
    demo.select({ n: count() }).from(schema.rating),
  ]);
  return (
    <>
      <PageHeader title="Demo" description="A made-up organisation for presentations, kept apart from the real data, like a phone's store mode." />
      <div className="grid gap-5">
        <Section title="How it works" info="Demo mode is per browser: switching it on changes nothing for anyone else.">
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">
            <li>The <b>Demo</b> button at the top of every page switches this browser to the demo organisation ({Number(people)} made-up people, {Number(ratings)} ratings). An orange bar stays at the top while it is on.</li>
            <li>In the orange bar you choose who you are: {DEMO_PERSONAS.map((p) => p.label.toLowerCase()).join(", ")}. Each sees the app exactly as that person would.</li>
            <li>Everything works: rate skills, confirm, set team needs, upload skills. It all stays in the demo database. No e-mail is sent and no sync runs.</li>
            <li>Accounts, single sign-on, ServiceNow, e-mail and backups are real, so they are read-only in demo mode.</li>
            <li><b>Back to real data</b> switches back. <b>Reset demo</b> puts the made-up data back as it was, for the next presentation.</li>
            <li>Everyone can use it: it is the easiest way to learn the app, and it cannot change anything real. It ends by itself after 12 hours.</li>
          </ul>
        </Section>
        <Section title={v?.demo ? "You are in demo mode" : "Try it"} info="Opens the demo as the head of the organisation; switch person in the orange bar.">
          <DemoControls inDemo={!!v?.demo} />
        </Section>
      </div>
    </>
  );
}
