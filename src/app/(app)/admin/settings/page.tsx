import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { readSettings } from "@/lib/dataset";
import { SettingsForm } from "./form";

export const metadata = { title: "Settings · Admin" };

export default async function SettingsAdmin() {
  const s = await readSettings(await getDb());
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Freshness and colours">
        <SettingsForm initial={s} />
      </Section>
    </>
  );
}
