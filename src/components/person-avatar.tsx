"use client";
// A person's picture, drawn as a round SVG that sizes itself. Its width is a CSS clamp of
// the screen width (.avatar in globals.css), and everything inside is drawn in a 40-unit
// box, so the initials grow and shrink with it: small on a phone, larger on a wide screen,
// never set in pixels by the page. With a photo URL (the template in Settings › ServiceNow)
// the photo fills the same circle; when it does not load the initials stay.
import { useId, useState } from "react";
import Link from "next/link";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionMenu, type MenuAction } from "@/components/action-menu";
import { personActions } from "@/components/menus";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/** A colour per name, the same every time: 0-359 on the colour wheel. */
export function avatarHue(name: string): number {
  let h = 7;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function PersonAvatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: AvatarSize; className?: string }) {
  const [failed, setFailed] = useState(false);
  const clip = useId();
  return (
    <svg viewBox="0 0 40 40" data-size={size} aria-hidden="true" focusable="false"
      className={cn("avatar", className)} style={{ "--avatar-hue": avatarHue(name) } as React.CSSProperties}>
      <circle cx="20" cy="20" r="20" className="avatar-bg" />
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" className="avatar-text">{initials(name) || "?"}</text>
      {src && !failed && (
        <>
          <clipPath id={clip}><circle cx="20" cy="20" r="20" /></clipPath>
          <image href={src} width="40" height="40" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} onError={() => setFailed(true)} />
        </>
      )}
    </svg>
  );
}

/** What a right-click on a person offers: the page's own actions first, then open and copy. */
function menuFor(name: string, href: string | null | undefined, email: string | null | undefined, actions: MenuAction[] | undefined): MenuAction[] {
  const own = personActions({ name, href, email });
  if (!actions?.length) return own;
  return [...actions, ...own.map((a, i) => (i === 0 ? { ...a, separator: true } : a))];
}

/**
 * A name with its picture: use this wherever a person is named. `sub` is a second, quieter
 * line (a designation); `href` makes the name a link. A right-click on it opens the person's
 * menu (open, copy, and whatever `actions` the page adds); `menu={false}` leaves that to the
 * thing it sits in, such as a table row with a menu of its own.
 */
export function Person({ name, href, src, sub, size = "sm", strong = true, className, email, actions, menu = true }: {
  name: string; href?: string | null; src?: string | null; sub?: React.ReactNode; size?: AvatarSize; strong?: boolean; className?: string;
  email?: string | null; actions?: MenuAction[]; menu?: boolean;
}) {
  return (
    <ActionMenu title={name} actions={menuFor(name, href, email, actions)} disabled={!menu || (!href && !actions?.length)}>
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-2 align-middle", className)}>
      <PersonAvatar name={name} src={src} size={size} />
      <span className="min-w-0">
        {href ? <Link href={href} className={cn("block truncate hover:underline", strong && "font-medium")}>{name}</Link>
          : <span className={cn("block truncate", strong && "font-medium")}>{name}</span>}
        {sub ? <span className="block truncate text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
    </ActionMenu>
  );
}

/** A name inside a line of text or a list of names: a small picture, then the name, kept together. */
export function PersonChip({ name, href, src, className, actions, menu = true }: { name: string; href?: string | null; src?: string | null; className?: string; actions?: MenuAction[]; menu?: boolean }) {
  return (
    <ActionMenu title={name} actions={menuFor(name, href, null, actions)} disabled={!menu || (!href && !actions?.length)}>
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap align-middle", className)}>
      <PersonAvatar name={name} src={src} size="xs" />
      {href ? <Link href={href} className="text-foreground hover:underline">{name}</Link> : <span className="text-foreground">{name}</span>}
    </span>
    </ActionMenu>
  );
}
