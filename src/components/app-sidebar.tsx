"use client";
// The menu. Entries are grouped under a heading with a line between groups; each says in a
// second line what is behind it. A page that has sections (a team, Settings) shows them as
// a sub menu under its entry, so nobody has to open the page to find out what is in it.
// Collapsed to icons, the sub menus move to the top of the page (components/sub-menu.tsx).
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  House, ChartNoAxesColumn, CircleHelp, Users, Shapes, PencilLine, Settings,
  LogOut, KeyRound, Sun, Moon, Monitor, ChevronsUpDown, Network, UsersRound, BriefcaseBusiness, ChevronRight, Inbox } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/person-avatar";
import { MenuButton } from "@/components/menu-button";
import { authClient } from "@/lib/auth-client";
import { locate, type MenuGroup, type MenuIcon, type MenuItem, type SubItem } from "@/lib/menu";
import { cn } from "@/lib/utils";

export const MENU_ICONS: Record<MenuIcon, typeof House> = {
  home: House, insights: ChartNoAxesColumn, help: CircleHelp, people: Users, skills: Shapes,
  assess: PencilLine, admin: Settings, team: UsersRound, org: Network, roles: BriefcaseBusiness, requests: Inbox,
};

function Count({ value, attention, className }: { value: number | string; attention?: boolean; className?: string }) {
  return (
    <span className={cn("ml-auto shrink-0 rounded-full px-1.5 text-[11px] leading-5 font-medium tabular",
      attention ? "bg-primary text-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground/80", className)}>{value}</span>
  );
}

export function AppSidebar({ groups, user, canChangePassword = true }: {
  groups: MenuGroup[];
  user: { name: string; role: string; detail: string; photo?: string | null };
  canChangePassword?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const here = locate(groups, pathname, (n) => params.get(n));
  const close = () => setOpenMobile(false);

  // which sub menus are open: the one you are in always opens; the chevron closes and opens any
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const hereKey = here?.item.sub ? here.item.key : null;
  useEffect(() => { if (hereKey) setOpened((o) => (o[hereKey] ? o : { ...o, [hereKey]: true })); }, [hereKey]);
  const isOpen = (item: MenuItem) => opened[item.key] ?? (!!item.open || here?.item.key === item.key);

  // looking at another team than your own: the sub menu stays on that team, and the count
  // of what waits for you (your own team's) is not shown against it
  const scope = pathname === "/team" ? params.get("scope") : null;
  const subHref = (item: MenuItem, s: SubItem) => (item.key === "team" && scope ? `${s.href}&scope=${encodeURIComponent(scope)}` : s.href);

  const entry = (item: MenuItem) => {
    const Icon = MENU_ICONS[item.icon];
    const current = here?.item.key === item.key;
    const exact = current && !here?.sub;
    const open = !!item.sub && isOpen(item);
    const badge = scope && item.key === "team" ? undefined : item.badge;
    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild isActive={exact} tooltip={{ children: <><b className="font-medium">{item.label}</b><span className="block opacity-80">{item.hint}</span></> }}
          className={cn("h-auto items-start gap-2.5 py-1.5", current && !exact && "font-medium text-sidebar-accent-foreground")}>
          <Link href={item.href} onClick={close} aria-current={exact ? "page" : undefined}>
            <Icon className="mt-0.5 group-data-[collapsible=icon]:mt-0" />
            <span className="grid min-w-0 flex-1 leading-snug">
              <span className="flex min-w-0 items-center gap-2"><span className="truncate">{item.label}</span>{badge && !open ? <Count value={badge} attention /> : null}</span>
              <span className="truncate text-xs font-normal text-sidebar-foreground/60">{item.hint}</span>
            </span>
          </Link>
        </SidebarMenuButton>
        {item.sub && (
          <SidebarMenuAction aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} what is in ${item.label}`} title={open ? "Hide the sub menu" : "Show the sub menu"}
            onClick={() => setOpened((o) => ({ ...o, [item.key]: !open }))}>
            <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          </SidebarMenuAction>
        )}
        {item.sub && open && (
          <SidebarMenuSub aria-label={`${item.label}: sections`} className="mt-0.5 mb-1 gap-0.5">
            {item.sub.map((s) => {
              const on = current && here?.sub?.key === s.key;
              return (
                <SidebarMenuSubItem key={s.key}>
                  <SidebarMenuSubButton asChild isActive={on} className={cn(on && "font-medium")}>
                    <Link href={subHref(item, s)} onClick={close} title={s.hint} aria-current={on ? "page" : undefined}
                      ref={on ? (el) => { el?.scrollIntoView({ block: "nearest" }); } : undefined}>
                      <span className="truncate">{s.label}</span>
                      {s.badge != null && !(scope && item.key === "team") ? <Count value={s.badge} attention={s.attention} /> : null}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      {/* the app's name, and the Menu button next to it; folded down to icons, the button is under the logo */}
      <SidebarHeader className="flex-row items-center gap-0.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
        <SidebarMenu className="flex-1 group-data-[collapsible=icon]:flex-none">
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="pr-0">
              <Link href="/" onClick={close}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Shapes className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">Skill Management</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <MenuButton className="gap-1 px-1.5 has-[>svg]:px-1.5 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0" labelClassName="group-data-[collapsible=icon]:hidden" />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Menu">
          {groups.map((g, i) => (
            <Fragment key={g.key}>
              {i > 0 && <SidebarSeparator className="mx-3 w-auto data-horizontal:w-auto" />}
              <SidebarGroup className="py-1.5">
                <SidebarGroupLabel className={cn("h-7 text-[11px] font-semibold tracking-wider uppercase", i === 0 && "text-sidebar-foreground")}>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">{g.items.map(entry)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </Fragment>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" aria-label={`${user.name}: account`}>
                  <PersonAvatar name={user.name} src={user.photo} className="size-8!" />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.role}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.detail}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />}
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                      <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {canChangePassword && (
                  <DropdownMenuItem asChild>
                    <Link href="/change-password"><KeyRound />Change password</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await authClient.signOut();
                    router.replace("/login");
                    router.refresh();
                  }}
                >
                  <LogOut />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
