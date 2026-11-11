"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveSettings } from "@/app/actions/admin";

export function SettingsForm({ initial }: { initial: { staleMonths: number; excludeStale: boolean; greenAt: number; amberAt: number } }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form className="grid max-w-xl gap-5" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveSettings(s);
        if (r.ok) toast.success(r.message ?? "Saved"); else toast.error(r.error);
      });
    }}>
      <div className="grid gap-1.5">
        <Label htmlFor="stale">A validated rating goes stale after (months)</Label>
        <Input id="stale" type="number" min={1} max={60} className="w-32" value={s.staleMonths} onChange={(e) => setS({ ...s, staleMonths: Number(e.target.value) })} />
        <p className="text-xs text-muted-foreground">Stale ratings show faded in the heatmaps and count in the Stale tile. Skills fade when they are not used; this asks for a fresh look.</p>
      </div>
      <div className="flex items-start gap-3">
        <Switch id="excl" checked={s.excludeStale} onCheckedChange={(c) => setS({ ...s, excludeStale: c })} />
        <div className="grid gap-1">
          <Label htmlFor="excl">Stale ratings do not count as on target</Label>
          <p className="text-xs text-muted-foreground">Off: a stale rating still counts, flagged. On: it counts as a gap until re-validated.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="green">Green from (% on target)</Label>
          <Input id="green" type="number" min={1} max={100} value={s.greenAt} onChange={(e) => setS({ ...s, greenAt: Number(e.target.value) })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="amber">Amber from (% on target)</Label>
          <Input id="amber" type="number" min={0} max={99} value={s.amberAt} onChange={(e) => setS({ ...s, amberAt: Number(e.target.value) })} />
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">Below amber is red. Used for the unit heatmap and the KPI tiles.</p>
      </div>
      <Button type="submit" className="justify-self-start" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save settings</Button>
    </form>
  );
}
