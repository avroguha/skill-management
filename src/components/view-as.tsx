"use client";
// The "View as" button an administrator uses, and the banner shown while viewing as someone.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startViewAs, stopViewAs } from "@/app/actions/view-as";

export function ViewAsButton({ employeeId, name, variant = "outline", size = "default", iconOnly = false }: {
  employeeId: string; name: string; variant?: "outline" | "ghost"; size?: "default" | "sm" | "icon"; iconOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    const r = await startViewAs(employeeId);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Viewing as ${r.name}. Read-only.`);
    router.push("/");
    router.refresh();
  });
  return (
    <Button variant={variant} size={size} onClick={go} disabled={pending} aria-label={`View as ${name}`} title={`See the app exactly as ${name} does (read-only)`}>
      {pending ? <Loader2 className="animate-spin" /> : <Eye />}{!iconOnly && "View as"}
    </Button>
  );
}

export function ViewAsBanner({ name, role, by, expiresAt }: { name: string; role: string; by: string; expiresAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // minutes left, worked out in the browser (no server/client clock mismatch)
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const m = Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000));
      setLeft(m);
      if (m === 0) router.refresh();
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [expiresAt, router]);
  const stop = () => start(async () => {
    const r = await stopViewAs();
    router.push(r.returnTo);
    router.refresh();
  });
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-status-minor bg-status-minor px-4 py-1.5 text-sm text-status-minor-fg">
      <Eye className="size-4 shrink-0" />
      <span className="min-w-0">
        Viewing as <b>{name}</b> <span className="opacity-80">({role})</span>: exactly what they see, read-only.
        <span className="opacity-80">{left != null && ` Ends in ${left} min.`} {by} stays signed in.</span>
      </span>
      <Button size="sm" variant="outline" className="ml-auto h-7 border-current/30 bg-transparent text-current hover:bg-black/5" onClick={stop} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <X />}Stop viewing
      </Button>
    </div>
  );
}
