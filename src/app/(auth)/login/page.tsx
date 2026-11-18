import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/server";
import { readSsoSettings } from "@/lib/sso-gate";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // ?next=: the page an e-mail link points to; already signed in, go straight there
  const next = safeNext(sp.next);
  if (await getViewer()) redirect(next);
  const db = await getDb("live");
  // Single sign-on is offered only once an administrator has tested and activated it.
  const sso = await readSsoSettings(db);
  const providers = sso.active
    ? await db.select({ providerId: schema.ssoProvider.providerId, domain: schema.ssoProvider.domain }).from(schema.ssoProvider)
    : [];
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm providers={providers} demo={false} error={sp.error ?? null} next={next} />
    </div>
  );
}
