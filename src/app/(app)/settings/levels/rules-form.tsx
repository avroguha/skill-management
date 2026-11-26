"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, ToggleField } from "@/components/info";
import { saveSettings } from "@/app/actions/admin";
import type { Settings } from "@/lib/engine/engine";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form className="grid max-w-xl gap-5" onSubmit={(e) => {
      e.preventDefault();
      if (!Number.isInteger(s.fitPercent) || s.fitPercent < 1 || s.fitPercent > 100) { toast.error("The match needed is a positive whole number: 1 to 100."); return; }
      start(async () => {
        const r = await saveSettings({ ...s });
        if (r.ok) toast.success(r.message ?? "Saved"); else toast.error(r.error);
      });
    }}>
      <ToggleField label="Managers rate themselves too" info="Off (the default): people who have others reporting to them are not asked to rate their own skills and count in no gap; they may still add skills. On: they are asked like everyone else, against their role's targets.">
        <Switch id="mgr" checked={s.managersAssess} onCheckedChange={(c) => setS({ ...s, managersAssess: c })} />
      </ToggleField>
      <Field label="A confirmed rating goes stale after (months)" htmlFor="stale" info="Skills fade when they are not used. A rating older than this is flagged as stale everywhere, as a prompt for a fresh look.">
        <Input id="stale" type="number" min={1} max={60} className="w-32" value={s.staleMonths} onChange={(e) => setS({ ...s, staleMonths: Number(e.target.value) })} />
      </Field>
      <ToggleField label="Stale ratings do not count as on target" info="Off: a stale rating still counts, flagged. On: it counts as a gap until the person sends it again and their manager confirms it.">
        <Switch id="excl" checked={s.excludeStale} onCheckedChange={(c) => setS({ ...s, excludeStale: c })} />
      </ToggleField>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Green from (% on target)" htmlFor="green" info="An on-target share at or above this is green in the tiles and the capability heatmap.">
          <Input id="green" type="number" min={1} max={100} value={s.greenAt} onChange={(e) => setS({ ...s, greenAt: Number(e.target.value) })} />
        </Field>
        <Field label="Amber from (% on target)" htmlFor="amber" info="At or above this (and below green) is amber; below it is red.">
          <Input id="amber" type="number" min={0} max={99} value={s.amberAt} onChange={(e) => setS({ ...s, amberAt: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Fits another team from (% of a role's skills)" htmlFor="fit" hint="A positive whole number, 1 to 100."
        info="A manager sees where their people would also fit (My team › Fit in other teams): a person is listed for a role of another team when they hold at least this share of the skills that role asks for, at the level it asks for. 50 means half of them.">
        <Input id="fit" type="number" min={1} max={100} step={1} className="w-32" value={s.fitPercent}
          onChange={(e) => setS({ ...s, fitPercent: Number(e.target.value) })} />
      </Field>
      <ToggleField label="People see which other teams they would fit in" info="Off (the default): only a person's managers see where that person would also fit; the person does not. On: each person also sees it for themselves, on My skills and on their own page. It never shows anybody else's.">
        <Switch id="fit-show" checked={!!s.membersSeeFit} onCheckedChange={(c) => setS({ ...s, membersSeeFit: c })} />
      </ToggleField>
      <Button type="submit" className="justify-self-start" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
    </form>
  );
}
