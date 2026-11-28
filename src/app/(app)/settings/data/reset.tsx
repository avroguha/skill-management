"use client";
// Settings › Data & backups › Reset: put one thing back, or everything to how the app was
// first installed. Every choice says what goes and what stays before anything happens, a
// backup is taken first, and RESET has to be typed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, LabelInfo } from "@/components/info";
import { resetData } from "@/app/actions/admin";

type What = "assessments" | "team" | "requests" | "everything";
type Opt = { id: string; name: string };

const CHOICES: { value: What; title: string; goes: string; stays: string }[] = [
  { value: "assessments", title: "Assessments", goes: "The ratings people gave themselves, what managers confirmed, notes and the rating history, for everyone, one team or one person.", stays: "Roles, team needs, the catalogue, requests." },
  { value: "team", title: "A team’s roles and needs", goes: "The roles of a team (who is in them, the skills they ask for), its team needs and any changes not confirmed yet.", stays: "The people and their ratings; the catalogue." },
  { value: "requests", title: "Requests", goes: "Every request for a new skill or category, decided or not.", stays: "Skills and categories that were approved stay in the catalogue." },
  { value: "everything", title: "Everything: back to how it was first installed", goes: "All ratings and their history, every team’s roles and needs, unconfirmed changes, requests and team names. The skill catalogue, the level wording and the rules go back to what the app ships with.", stays: "People and who reports to whom, accounts, single sign-on, ServiceNow, e-mail, the help page, the audit log and the backups." },
];

export function ResetData({ managers, people }: { managers: (Opt & { below: number })[]; people: Opt[] }) {
  const router = useRouter();
  const [what, setWhat] = useState<What>("assessments");
  const [whose, setWhose] = useState<"all" | "team" | "person">("all");
  const [team, setTeam] = useState("");
  const [person, setPerson] = useState("");
  const [below, setBelow] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const choice = CHOICES.find((c) => c.value === what)!;
  const scope = what === "assessments" ? (whose === "all" ? "all" : whose === "team" ? team : person) : what === "team" ? (whose === "all" ? "all" : team) : "all";
  const ready = confirm.trim().toUpperCase() === "RESET" && scope !== "";
  const chosenTeam = managers.find((m) => m.id === team);

  const run = () => start(async () => {
    const r = await resetData({ what, scope, below: what === "team" && whose === "team" && below, confirm });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Reset.", { duration: 12000 });
    setConfirm("");
    router.refresh();
  });

  return (
    <div className="grid gap-4">
      <Field label="What to reset" info="Choose one. What goes and what stays is written under each choice. Nothing happens until you type RESET and press the button.">
        <RadioGroup value={what} onValueChange={(v) => { setWhat(v as What); setWhose("all"); setConfirm(""); }} className="grid gap-2 lg:grid-cols-2">
          {CHOICES.map((c) => (
            <label key={c.value} className="flex cursor-pointer text-sm items-start gap-2 rounded-md border p-3 font-normal has-[:checked]:border-primary has-[:checked]:bg-accent/40">
              <RadioGroupItem value={c.value} className="mt-0.5" />
              <span className="grid gap-0.5"><span className="font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground"><b className="font-medium text-foreground/80">Goes:</b> {c.goes}</span>
                <span className="text-xs text-muted-foreground"><b className="font-medium text-foreground/80">Stays:</b> {c.stays}</span></span>
            </label>
          ))}
        </RadioGroup>
      </Field>

      {(what === "assessments" || what === "team") && (
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
          <Field label={what === "assessments" ? "Whose assessments" : "Which team"} info={what === "assessments" ? "Everyone, one team (its manager and everyone below them), or one person." : "Every team, or one team. For one team you can include the teams below it."}>
            <Select value={whose} onValueChange={(v) => setWhose(v as "all" | "team" | "person")}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{what === "assessments" ? "Everyone" : "Every team"}</SelectItem>
                <SelectItem value="team">One team</SelectItem>
                {what === "assessments" && <SelectItem value="person">One person</SelectItem>}
              </SelectContent>
            </Select>
          </Field>
          {whose === "team" && (
            <Field label="Team" info="A team is a manager and the people below them.">
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="w-full max-w-xl"><SelectValue placeholder="Choose a team…" /></SelectTrigger>
                <SelectContent>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          {whose === "person" && what === "assessments" && (
            <Field label="Person" info="Only this person’s ratings and their history are removed.">
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger className="w-full max-w-xl"><SelectValue placeholder="Choose a person…" /></SelectTrigger>
                <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          {what === "team" && whose === "team" && !!chosenTeam?.below && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={below} onCheckedChange={(c) => setBelow(!!c)} />Also the {chosenTeam.below} team{chosenTeam.below === 1 ? "" : "s"} below it</label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <LabelInfo htmlFor="reset-confirm" info="A backup of everything is taken first; if it cannot be written, nothing is reset. Restore it from the list of backups to undo the reset.">Type RESET to confirm</LabelInfo>
          <Input id="reset-confirm" className="w-48" value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button variant="destructive" disabled={!ready || pending} onClick={run}>
          {pending ? <Loader2 className="animate-spin" /> : <AlertTriangle />}Reset {choice.value === "everything" ? "everything" : choice.title.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
