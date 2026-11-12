import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/server";
import { readSsoSettings } from "@/lib/sso-gate";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getViewer()) redirect("/");
  const sp = await searchParams;
  const db = await getDb();
  // Single sign-on is offered only once an administrator has tested and activated it.
  const sso = await readSsoSettings(db);
  const providers = sso.active
    ? await db.select({ providerId: schema.ssoProvider.providerId, domain: schema.ssoProvider.domain }).from(schema.ssoProvider)
    : [];
  // The hint shows only while the demo sign-ins exist; clearing the demo removes them.
  const demoUsers = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.username, "exec"));
  const demo = process.env.SEED_DEMO === "true" && demoUsers.length > 0;
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm providers={providers} demo={demo} error={sp.error ?? null} />
    </div>
  );
}
