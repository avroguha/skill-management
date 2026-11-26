"use client";
// What a right-click offers on the things that appear everywhere: a person, a skill, a link.
// Pages add their own actions in front (a role's, a need's, a request's).
import Link from "next/link";
import { Copy, ExternalLink, Mail, SquareArrowOutUpRight, UserRound, Shapes, Users } from "lucide-react";
import { ActionMenu, type MenuAction } from "@/components/action-menu";

export function personActions(p: { name: string; href?: string | null; email?: string | null }): MenuAction[] {
  return [
    ...(p.href ? [
      { key: "open", label: "Open their page", icon: UserRound, href: p.href },
      { key: "tab", label: "Open in a new tab", icon: SquareArrowOutUpRight, href: p.href, newTab: true },
    ] : []),
    { key: "copy", label: "Copy the name", icon: Copy, copy: p.name, separator: !!p.href },
    ...(p.email ? [{ key: "mail", label: "Copy the e-mail address", icon: Mail, copy: p.email }] : []),
  ];
}

export function skillActions(k: { id: string; name: string }): MenuAction[] {
  return [
    { key: "open", label: "Open the skill", hint: "What it covers and who has it", icon: Shapes, href: `/skills/${k.id}` },
    { key: "who", label: "Find people who have it", icon: Users, href: `/people?skill=${k.id}` },
    { key: "tab", label: "Open in a new tab", icon: SquareArrowOutUpRight, href: `/skills/${k.id}`, newTab: true },
    { key: "copy", label: "Copy the name", icon: Copy, copy: k.name, separator: true },
  ];
}

export function linkActions(l: { href: string; name: string; noun?: string }): MenuAction[] {
  return [
    { key: "open", label: l.noun ? `Open ${l.noun}` : "Open", icon: ExternalLink, href: l.href },
    { key: "tab", label: "Open in a new tab", icon: SquareArrowOutUpRight, href: l.href, newTab: true },
    { key: "copy", label: "Copy the name", icon: Copy, copy: l.name, separator: true },
  ];
}

/** A skill's name as a link, with the skill's right-click menu. For server pages. */
export function SkillLink({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <ActionMenu title={name} actions={skillActions({ id, name })}>
      <Link href={`/skills/${id}`} className={className ?? "font-medium hover:underline"}>{name}</Link>
    </ActionMenu>
  );
}

/** Any link with Open / Open in a new tab / Copy on right-click. For server pages. */
export function MenuLink({ href, name, noun, className, children }: { href: string; name: string; noun?: string; className?: string; children?: React.ReactNode }) {
  return (
    <ActionMenu title={name} actions={linkActions({ href, name, noun })}>
      <Link href={href} className={className ?? "font-medium hover:underline"}>{children ?? name}</Link>
    </ActionMenu>
  );
}
