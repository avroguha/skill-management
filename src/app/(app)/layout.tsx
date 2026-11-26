import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { FindBox, MenuTrail } from "@/components/menu-bar";
import { MenuButton } from "@/components/menu-button";
import { ViewAsBanner } from "@/components/view-as";
import { DemoBanner, DemoSwitch } from "@/components/demo";
import { requireViewer, getEngine, ACCESS_ROLES, DEMO_PERSONAS } from "@/lib/server";
import { getNextSteps } from "@/lib/next-steps-server";
import { NextStepButton } from "@/components/next-step";
import { buildMenu, tasksFor } from "@/lib/menu";
import { getMenuFor } from "@/lib/menu-server";
import { photoUrls } from "@/lib/photos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer();
  const engine = await getEngine();

  // The menu: what this person can open, and what waits for them.
  const me = v.employee;
  const who = await getMenuFor();
  const menu = buildMenu(who);
  const tasks = tasksFor(who);

  // what they are, in a few words: a manager is anyone with people reporting to them
  const roleLabel = v.demo ? `Demo · ${v.demo.label}`
    : v.assignedRole === "coordinator" ? `Coordinator${me && v.role === "manager" ? ` · ${engine.teamLabel(me.id)}` : ""}`
    : v.role === "manager" && me ? `Manager · ${engine.teamLabel(me.id)}`
      : v.role === "employee" && me?.managerId ? `Team member · ${engine.teamLabel(me.managerId)}`
        : ACCESS_ROLES.find((r) => r.value === v.role)?.label ?? v.role;
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const [next] = await getNextSteps();
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar groups={menu}
        user={{ name: v.name, role: roleLabel, photo: me ? (await photoUrls()).get(me.id) ?? null : null,
          detail: v.demo ? `signed in as ${v.demo.realName}` : v.username ? `@${v.username} · ${v.email}` : v.email }}
        canChangePassword={!v.demo} />
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-20">
          {v.demo && <DemoBanner persona={v.demo.persona} canReset={v.demo.canReset} personas={DEMO_PERSONAS.map((p) => ({ key: p.key, label: p.label, description: p.description }))} />}
          {v.viewAs && <ViewAsBanner name={v.name} role={roleLabel} by={v.viewAs.byName} expiresAt={v.viewAs.expiresAt} />}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
            {/* on a phone the menu is closed until asked for, so its button is here too */}
            <MenuButton className="-ml-1 md:hidden" />
            <MenuTrail groups={menu} />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <FindBox groups={menu} tasks={tasks} />
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
