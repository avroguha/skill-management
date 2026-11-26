"use server";
// Demo mode, like a phone's store mode: this browser switches to the demo database (made-up
// people and skills) and back. Nothing done in demo mode reaches the live data. Everyone can
// switch (it is the easiest way to learn the app) and starts as the made-up person closest to
// their own role; resetting the demo is for managers, leaders and administrators, so nobody
// resets it in the middle of someone else's presentation. The live audit log records each switch.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { appUrl } from "@/lib/auth";
import { demoCookie, DEMO_COOKIE, DEMO_PERSONAS, forgetSharedEngine, getRealViewer, getViewer, type DemoPersona } from "@/lib/server";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const isPersona = (p: string): p is DemoPersona => DEMO_PERSONAS.some((x) => x.key === p);

async function setCookie(userId: string, persona: DemoPersona) {
  const { value, expires } = demoCookie(userId, persona);
  (await cookies()).set(DEMO_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: appUrl().startsWith("https://"), path: "/", expires });
}

/** The demo person closest to someone's own role: a team member sees a team member first. */
function startingPersona(real: { role: string; assignedRole?: string }): DemoPersona {
  if (real.assignedRole === "coordinator") return "coordinator";
  return real.role === "admin" ? "admin" : real.role === "leader" ? "top" : real.role === "manager" ? "manager" : "member";
}

/** Into demo mode (or another demo person while in it). */
export async function enterDemo(personaKey?: string): Promise<Result> {
  const real = await getRealViewer();
  if (!real) return { ok: false, error: "Not signed in." };
  const persona = personaKey ?? startingPersona(real);
  if (!real.canDemo) return { ok: false, error: "Demo mode is not available for this account." };
  if (!isPersona(persona)) return { ok: false, error: "Unknown demo person." };
  await getDb("demo"); // creates and fills the demo database on first use
  const already = (await getViewer())?.demo;
  await setCookie(real.userId, persona);
  if (!already) await auditLive(real, "demo_start", persona);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function leaveDemo(): Promise<Result> {
  const real = await getRealViewer();
  (await cookies()).delete(DEMO_COOKIE);
  if (real) await auditLive(real, "demo_stop", "");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Puts the demo data back as it was (for the next presentation). Only in demo mode. */
export async function resetDemoData(): Promise<Result> {
  const v = await getViewer();
  if (!v?.demo) return { ok: false, error: "Switch to demo mode first: this resets the demo data only." };
  if (!v.demo.canReset) return { ok: false, error: "Resetting the demo is for managers, leaders and administrators: someone may be presenting with it." };
  const { resetDemo } = await import("@/db/demo");
  await resetDemo(await getDb("demo"));
  forgetSharedEngine("demo");
  revalidatePath("/", "layout");
  return { ok: true, message: "The demo data is back as it was." };
}

async function auditLive(real: NonNullable<Awaited<ReturnType<typeof getRealViewer>>>, action: string, persona: string) {
  // the live audit log: who looked at the demo and when (the demo has its own log)
  const db = await getDb("live");
  const { schema } = await import("@/db");
  await db.insert(schema.auditLog).values({ actorId: real.userId, actorName: real.name, action, entity: "demo", entityId: persona || null });
}
