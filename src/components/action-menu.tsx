"use client";
// One menu, two ways in: right-click (or press and hold on a phone) the thing itself, or
// press its "⋯" button. Both show the same actions for what was clicked: a person, a role,
// a skill, a need, a request, a row. The menu names what it is about at the top, and an
// action that is not possible stays in view, greyed, with the reason under it.
import { useRouter } from "next/navigation";
import { ContextMenu as Ctx, DropdownMenu as Drop } from "radix-ui";
import { ChevronRight, MoreHorizontal, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface MenuAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** a dot of this colour in place of the icon (a role's tint) */
  swatch?: string;
  /** a quieter second line */
  hint?: string;
  onSelect?: () => void;
  /** goes there; with newTab, in a new tab */
  href?: string;
  newTab?: boolean;
  /** copies this text */
  copy?: string;
  /** not possible now: true, or the reason (shown under the label) */
  disabled?: boolean | string;
  destructive?: boolean;
  /** a line above this action */
  separator?: boolean;
  /** a sub menu */
  children?: MenuAction[];
}

const CONTENT = "z-50 max-h-[min(var(--radix-context-menu-content-available-height,80vh),28rem)] min-w-52 max-w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";
const ITEM = "relative flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-55 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0";
const LABEL = "truncate px-2 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground";
const SEP = "-mx-1 my-1 h-px bg-border";

function Body({ a }: { a: MenuAction }) {
  const Icon = a.icon;
  const why = typeof a.disabled === "string" ? a.disabled : a.hint;
  return (
    <>
      {a.swatch ? <span className="tint-dot mt-0.5 size-4 shrink-0 rounded-full border border-foreground/15" style={{ "--tint": a.swatch } as React.CSSProperties} aria-hidden />
        : Icon ? <Icon aria-hidden /> : <span className="w-4 shrink-0" aria-hidden />}
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{a.label}</span>
        {why ? <span className="text-xs font-normal whitespace-normal text-muted-foreground">{why}</span> : null}
      </span>
    </>
  );
}

/** The same list of actions, drawn with either Radix menu (context or dropdown). */
function Items({ kit, actions, run }: { kit: typeof Ctx | typeof Drop; actions: MenuAction[]; run: (a: MenuAction) => void }) {
  const K = kit as typeof Drop;
  return (
    <>
      {actions.map((a) => (
        <span key={a.key} className="contents">
          {a.separator && <K.Separator className={SEP} />}
          {a.children?.length ? (
            <K.Sub>
              <K.SubTrigger disabled={!!a.disabled} className={cn(ITEM, "data-[state=open]:bg-accent")}>
                <Body a={a} /><ChevronRight className="ml-auto opacity-60" aria-hidden />
              </K.SubTrigger>
              <K.Portal>
                <K.SubContent className={CONTENT} collisionPadding={12} sideOffset={2}>
                  <Items kit={kit} actions={a.children} run={run} />
                </K.SubContent>
              </K.Portal>
            </K.Sub>
          ) : (
            <K.Item disabled={!!a.disabled} className={cn(ITEM, a.destructive && "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive")} onSelect={() => run(a)}>
              <Body a={a} />
            </K.Item>
          )}
        </span>
      ))}
    </>
  );
}

function useRun() {
  const router = useRouter();
  return (a: MenuAction) => {
    if (a.copy != null) {
      void navigator.clipboard?.writeText(a.copy).then(() => toast.success("Copied."), () => toast.error("Could not copy."));
      return;
    }
    if (a.href) { if (a.newTab) window.open(a.href, "_blank", "noopener"); else router.push(a.href); return; }
    a.onSelect?.();
  };
}

/**
 * Right-click (or press and hold) anywhere on the children for the actions. `title` says
 * what the menu is about. With no actions the children are drawn as they are.
 */
export function ActionMenu({ actions, title, children, disabled }: { actions: MenuAction[]; title?: string; children: React.ReactElement; disabled?: boolean }) {
  const run = useRun();
  if (!actions.length || disabled) return children;
  return (
    <Ctx.Root>
      {/* the innermost menu wins: a person inside a row gets the person's menu, not both */}
      <Ctx.Trigger asChild onContextMenu={(e) => e.stopPropagation()}>{children}</Ctx.Trigger>
      <Ctx.Portal>
        <Ctx.Content className={CONTENT} collisionPadding={12}>
          {title && <Ctx.Label className={LABEL}>{title}</Ctx.Label>}
          <Items kit={Ctx} actions={actions} run={run} />
        </Ctx.Content>
      </Ctx.Portal>
    </Ctx.Root>
  );
}

/**
 * The "⋯" button with the same actions: for a mouse without a right button, a keyboard, a
 * phone. With children, they are the button (a skill's chip, say) and a press opens the menu.
 */
export function ActionButton({ actions, title, label, className, children, align = "end" }: { actions: MenuAction[]; title?: string; label: string; className?: string; children?: React.ReactNode; /** which edge of the button the menu lines up with */ align?: "start" | "end" }) {
  const run = useRun();
  if (!actions.length) return children ? <span className={className}>{children}</span> : null;
  return (
    <Drop.Root>
      <Drop.Trigger aria-label={label} title={children ? undefined : label}
        className={children ? className : cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent", className)}
        onClick={(e) => e.stopPropagation()}>
        {children ?? <MoreHorizontal className="size-4" />}
      </Drop.Trigger>
      <Drop.Portal>
        <Drop.Content align={align} sideOffset={4} collisionPadding={12} className={cn(CONTENT, "max-h-[min(var(--radix-dropdown-menu-content-available-height,80vh),28rem)]")}>
          {title && <Drop.Label className={LABEL}>{title}</Drop.Label>}
          <Items kit={Drop} actions={actions} run={run} />
        </Drop.Content>
      </Drop.Portal>
    </Drop.Root>
  );
}
