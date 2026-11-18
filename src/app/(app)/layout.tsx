import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type NavItem } from "@/components/app-sidebar";
import { ViewAsBanner } from "@/components/view-as";
import { DemoBanner, DemoSwitch } from "@/components/demo";
import { requireViewer, getEngine, ACCESS_ROLES, DEMO_PERSONAS } from "@/lib/server";
import { getNextSteps } from "@/lib/next-steps-server";
import { NextStepButton } from "@/components/next-step";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer();
  const engine = await getEngine();

  // Ratings waiting for this viewer to confirm: a count straight from the ratings.
  const waiting = v.role === "admin" ? 0 : engine.submittedCount(v.reportIds);
  const me = v.employee;
  const nav: NavItem[] = [{ href: "/", label: "Home", icon: "home" }];
  if (me) nav.push({ href: "/my-skills", label: "My skills", icon: "assess" });
  if (v.canSeeTeams) {
    nav.push({ href: "/team", label: "My team", icon: "team", badge: waiting || undefined });
    nav.push({ href: "/insights", label: "Insights", icon: "insights" });
    nav.push({ href: "/people", label: "People", icon: "people" });
    nav.push({ href: "/org", label: "Org chart", icon: "org" });
  }
  nav.push({ href: "/skills", label: "Skills", icon: "skills" });
  if (v.isAdmin) nav.push({ href: "/settings", label: "Settings", icon: "admin" });
  nav.push({ href: "/help", label: "Help", icon: "help" });

  // what they are, in a few words: a manager is anyone with people reporting to them
  const roleLabel = v.demo ? `Demo · ${v.demo.label}`
    : v.role === "manager" && me ? `Manager · ${engine.teamLabel(me.id)}`
      : v.role === "employee" && me?.managerId ? `Team member · ${engine.teamLabel(me.managerId)}`
        : ACCESS_ROLES.find((r) => r.value === v.role)?.label ?? v.role;
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const [next] = await getNextSteps();
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar nav={nav}
        user={{ name: v.name, role: roleLabel, detail: v.demo ? `signed in as ${v.demo.realName}` : v.username ? `@${v.username} · ${v.email}` : v.email }}
        canChangePassword={!v.demo} />
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-20">
          {v.demo && <DemoBanner persona={v.demo.persona} canReset={v.demo.canReset} personas={DEMO_PERSONAS.map((p) => ({ key: p.key, label: p.label, description: p.description }))} />}
          {v.viewAs && <ViewAsBanner name={v.name} role={roleLabel} by={v.viewAs.byName} expiresAt={v.viewAs.expiresAt} />}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <NextStepButton step={next} />
              {v.canDemo && !v.demo && !v.viewAs && <DemoSwitch />}
            </div>
          </header>
        </div>
        <div className="mx-auto w-full min-w-0 max-w-[1600px] p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
