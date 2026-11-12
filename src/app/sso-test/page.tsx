// Opened as a pop-up from Admin › Single sign-on: starts an SSO sign-in that comes back
// to /sso-test/done. While SSO is not active, the sign-in is captured and refused.
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/server";
import { StartTest } from "./start";

export const metadata = { title: "Single sign-on test" };

export default async function SsoTestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await getViewer();
  if (!v?.isAdmin) redirect("/login");
  const { provider } = await searchParams;
  const db = await getDb();
  const known = (await db.select({ id: schema.ssoProvider.providerId }).from(schema.ssoProvider)).map((p) => p.id);
  // an unknown or empty provider falls back to the first one configured
  const providerId = provider && known.includes(provider) ? provider : (known[0] ?? "");
  return <StartTest providerId={providerId} />;
}
