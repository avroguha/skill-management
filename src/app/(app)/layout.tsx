import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type NavItem } from "@/components/app-sidebar";
import { ViewAsBanner } from "@/components/view-as";
import { requireViewer, getEngine, ACCESS_ROLES } from "@/lib/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer();
  const engine = await getEngine();

  // Ratings waiting for this viewer's validation (any skill, not only required ones).
  let pending = 0;
  for (const id of v.reportIds) {
    const emp = engine.empById.get(id);
    if (!emp?.active) continue;
    for (const c of engine.personProfile(emp).cells) if (c.status === "submitted") pending += 1;
  }

  const main: NavItem[] = v.canSeeOrg ? [
    { href: "/", label: "Overview", icon: "overview" },
    { href: "/org", label: "Org chart", icon: "org" },
    { href: "/gaps", label: "Gaps", icon: "gaps" },
    { href: "/people", label: "People", icon: "people" },
    { href: "/skills", label: "Skills", icon: "skills" },
  ] : [];
  const mine: NavItem[] = [];
  if (v.employee) {
    mine.push({ href: `/people/${v.employee.id}`, label: "My profile", icon: "profile" });
    // the top of the organisation is not asked for skills
    if (!engine.isTop(v.employee)) mine.push({ href: "/assess", label: "Self-assessment", icon: "assess" });
  }
  // anyone with people reporting to them (or leading a unit) gets My team, whatever their role
  if (v.employee && engine.reportsOf(v.employee.id).some((e) => e.active)) mine.push({ href: "/team", label: "My team", icon: "team" });
  if (v.reportIds.size) mine.push({ href: "/validate", label: "Validate", icon: "validate", badge: pending || undefined });
  if (!v.canSeeOrg) mine.push({ href: "/skills", label: "Skill catalogue", icon: "skills" });
  const admin: NavItem[] = v.isAdmin ? [{ href: "/admin", label: "Admin", icon: "admin" }] : [];

  // Who they are decides what they get: a manager is anyone who runs a unit or has reports.
  const managed = v.employee ? engine.managedUnitIds(v.employee.id).map((id) => engine.unitById.get(id)?.name).filter(Boolean) : [];
  const roleLabel = v.role === "manager" && managed.length
    ? `Manager · ${managed[0]}${managed.length > 1 ? ` +${managed.length - 1}` : ""}`
    : v.role === "employee" && v.employee?.unitId ? `Team member · ${engine.unitById.get(v.employee.unitId)?.name ?? ""}`
      : ACCESS_ROLES.find((r) => r.value === v.role)?.label ?? v.role;
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar main={main} mine={mine} admin={admin}
        user={{ name: v.name, role: roleLabel, detail: v.username ? `@${v.username} · ${v.email}` : v.email }} />
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-20">
          {v.viewAs && <ViewAsBanner name={v.name} role={roleLabel} by={v.viewAs.byName} expiresAt={v.viewAs.expiresAt} />}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
          </header>
        </div>
        <div className="mx-auto w-full min-w-0 max-w-[1600px] p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
