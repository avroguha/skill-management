"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Presentation, RotateCcw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enterDemo, leaveDemo, resetDemoData } from "@/app/actions/demo";

export function DemoControls({ inDemo }: { inDemo: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const go = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, to?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error ?? "Something went wrong."); return; }
    if (r.message) toast.success(r.message);
    if (to) router.push(to);
    router.refresh();
  });
  return inDemo ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => go(resetDemoData)}><RotateCcw />Reset the demo data</Button>
      <Button disabled={busy} onClick={() => go(leaveDemo, "/")}><LogOut />Back to real data</Button>
    </div>
  ) : (
    <Button disabled={busy} onClick={() => go(() => enterDemo("top"), "/")}><Presentation />{busy ? "Opening demo…" : "Open the demo"}</Button>
  );
}
