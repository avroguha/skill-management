"use client";
// The demo switch (header) and the banner shown the whole time demo mode is on.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Presentation, RotateCcw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Info } from "@/components/info";
import { enterDemo, leaveDemo, resetDemoData } from "@/app/actions/demo";

export function DemoSwitch() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => start(async () => {
        const r = await enterDemo();
        if (!r.ok) { toast.error(r.error); return; }
        router.push("/");
        router.refresh();
      })}>
        <Presentation />{busy ? "Opening demo…" : "Demo"}
      </Button>
      <Info label="About demo mode" side="bottom">
        A made-up organisation (about 130 people) to look around in and try everything, like a phone&apos;s store mode: the
        easiest way to learn the app. You start as someone like you and can switch to a manager, a director or the head of
        the organisation in the orange bar. Nothing you do there reaches the real data: no e-mail is sent, no sync runs.
        <b>Back to real data</b> switches back.
      </Info>
    </div>
  );
}

export function DemoBanner({ persona, personas, canReset }: { persona: string; personas: { key: string; label: string; description: string }[]; canReset: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const go = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, to?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error ?? "Something went wrong."); return; }
    if (r.message) toast.success(r.message);
    if (to) router.push(to);
    router.refresh();
  });
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-amber-500 px-4 py-1.5 text-sm text-amber-950">
      <span className="flex items-center gap-1.5 font-semibold"><Presentation className="size-4" />Demo mode</span>
      <span className="hidden sm:inline">Made-up people and skills. Your real data is untouched.</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs">Seeing it as</span>
        <Select value={persona} disabled={busy} onValueChange={(p) => go(() => enterDemo(p), "/")}>
          <SelectTrigger size="sm" className="h-7 w-52 border-amber-950/30 bg-amber-50 text-amber-950" aria-label="Seeing the demo as"><SelectValue>{personas.find((p) => p.key === persona)?.label}</SelectValue></SelectTrigger>
          <SelectContent>
            {personas.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                <span className="grid"><span>{p.label}</span><span className="text-xs text-muted-foreground">{p.description}</span></span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {canReset && <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 text-amber-950 hover:bg-amber-400" disabled={busy}><RotateCcw />Reset demo</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Put the demo data back as it was?</AlertDialogTitle>
              <AlertDialogDescription>Ratings, confirmations and team needs changed during a demo are undone, for everyone presenting. Your real data is not touched.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => go(resetDemoData, "/")}>Reset demo</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>}
        <Button size="sm" className="h-7 bg-amber-950 text-amber-50 hover:bg-amber-900" disabled={busy} onClick={() => go(leaveDemo, "/")}><LogOut />Back to real data</Button>
      </div>
    </div>
  );
}
