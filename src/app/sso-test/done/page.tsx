// Where the test pop-up lands after the identity provider. A captured test stays open and
// shows what came back, with the mapping to the person and the account, so the
// administrator maps it right there; anything else tells the admin page and closes.
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/server";
import { readSsoSettings } from "@/lib/sso-gate";
import { SsoActivate } from "@/app/(app)/settings/sso/activate";
import { Done } from "./done";

export const metadata = { title: "Single sign-on test" };

export default async function SsoTestDone({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const error = sp.error ?? null;
  const v = await getViewer();
  if (v?.isAdmin && (error === "SSO_TEST" || error === "sso_test")) {
    const db = await getDb();
    const [providers, settings] = await Promise.all([db.select({ id: schema.ssoProvider.providerId }).from(schema.ssoProvider), readSsoSettings(db)]);
    return (
      <main className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-6">
        <Done error={error} description={null} stay />
        <SsoActivate mode="popup" providers={providers.map((p) => p.id)} initial={settings} />
      </main>
    );
  }
  return <Done error={error} description={sp.error_description ?? null} />;
}
