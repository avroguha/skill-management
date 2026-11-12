"use server";
// "View as": an administrator sees the app exactly as one person does, read-only, for up
// to an hour. Start and stop are recorded in the audit log under the administrator.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { appUrl } from "@/lib/auth";
import { audit, getRealViewer, getViewer, viewAsCookie, viewAsTarget, VIEW_AS_COOKIE } from "@/lib/server";

type Fail = { ok: false; error: string };

export async function startViewAs(employeeId: string): Promise<{ ok: true; name: string } | Fail> {
  const real = await getRealViewer();
  if (!real) return { ok: false, error: "Not signed in." };
  if (!real.isAdmin) return { ok: false, error: "Administrators only." };
  if (real.mustChangePassword) return { ok: false, error: "Change the default password first." };
  const t = await viewAsTarget(employeeId, real.userId);
  if (!t.ok) return t;
  const { value, expires } = viewAsCookie(real.userId, employeeId);
  (await cookies()).set(VIEW_AS_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: appUrl().startsWith("https://"), path: "/", expires });
  await audit(real, "view_as_start", "employee", employeeId, { name: t.employee.name });
  revalidatePath("/", "layout");
  return { ok: true, name: t.employee.name };
}

export async function stopViewAs(): Promise<{ ok: true; returnTo: string }> {
  const [v, real] = [await getViewer(), await getRealViewer()];
  (await cookies()).delete(VIEW_AS_COOKIE);
  if (real && v?.viewAs) await audit(real, "view_as_stop", "employee", v.viewAs.employeeId, { name: v.name });
  revalidatePath("/", "layout");
  return { ok: true, returnTo: v?.viewAs ? `/people/${v.viewAs.employeeId}` : "/" };
}
