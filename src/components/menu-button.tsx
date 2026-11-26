"use client";
// The Menu button: opens and closes the menu. It sits beside the app's name at the top of
// the menu, and stays in that corner when the menu is folded down to icons. On a phone the
// menu is out of sight until asked for, so the top bar has one as well.
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function MenuButton({ className, labelClassName }: { className?: string; labelClassName?: string }) {
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar();
  const open = isMobile ? openMobile : state === "expanded";
  return (
    <Button variant="outline" size="sm" className={cn("h-8 shrink-0", className)} onClick={toggleSidebar} aria-expanded={open}
      aria-label={open ? "Close the menu" : "Open the menu"} title={open ? "Close the menu (Ctrl+B)" : "Open the menu (Ctrl+B)"}>
      <Menu /><span className={labelClassName}>Menu</span>
    </Button>
  );
}
