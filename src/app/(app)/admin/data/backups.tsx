"use client";
// Backups: take one now, download, restore (stored or uploaded), delete, and the
// automatic schedule. Restoring always asks for RESTORE and signs everyone out after.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, HardDriveDownload, Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { backupNow, removeStored, restoreStored, saveBackupSettings } from "@/app/actions/backup";
import type { BackupSettings, StoredBackup } from "@/lib/backup";

const REASON: Record<string, string> = {
  manual: "By hand", scheduled: "Automatic", "before-restore": "Before a restore", "before-clear": "Before clearing",
  "before-upgrade": "Before an upgrade", uploaded: "Uploaded",
};
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function afterRestore(message: string) {
  toast.success(message, { duration: 8000 });
  // the restore signed everyone out: go to the sign-in page
  setTimeout(() => { window.location.href = "/login"; }, 2500);
}

export function Backups({ backups, settings, dir }: { backups: StoredBackup[]; settings: BackupSettings; dir: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState(settings);
  const [restoring, setRestoring] = useState<StoredBackup | null>(null);
  const [confirm, setConfirm] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileConfirm, setFileConfirm] = useState("");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await backupNow();
          if (r.ok) { toast.success(`Backed up: ${r.name}`); router.refresh(); } else toast.error(r.error);
        })}>{pending ? <Loader2 className="animate-spin" /> : <HardDriveDownload />}Back up now</Button>
        <Button variant="outline" asChild><a href="/api/backup/latest"><Download />Download a fresh backup</a></Button>
      </div>

      <div className="grid gap-3 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />Automatic backups</label>
          <label className="flex items-center gap-2 text-sm">every
            <Input type="number" min={1} max={168} className="h-8 w-20" value={s.everyHours} onChange={(e) => setS({ ...s, everyHours: Number(e.target.value) })} />hours
          </label>
          <label className="flex items-center gap-2 text-sm">keep the newest
            <Input type="number" min={1} max={365} className="h-8 w-20" value={s.keep} onChange={(e) => setS({ ...s, keep: Number(e.target.value) })} />
          </label>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await saveBackupSettings(s);
            if (r.ok) { toast.success("Saved"); router.refresh(); } else toast.error(r.error);
          })}><Save />Save</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Backups are written to <code className="font-mono break-all">{dir}</code> on the server, outside the app, so a redeploy never touches them.
          Point BACKUP_DIR at another disk or a network share so losing the server does not lose them too, or download them.
          Backups made by hand are kept until deleted; the rest are pruned to the newest {s.keep}.
          A backup holds everything, including user accounts and configuration: keep the files somewhere safe.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Taken</th><th className="px-3 text-left font-medium">Why</th>
            <th className="px-3 text-right font-medium">Size</th><th className="px-3" />
          </tr></thead>
          <tbody>
            {backups.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No backups yet.</td></tr>}
            {backups.map((b) => (
              <tr key={b.name} className="border-b last:border-0">
                <td className="px-3 py-1.5"><div>{when(b.at)}</div><div className="font-mono text-[11px] text-muted-foreground">{b.name}</div></td>
                <td className="px-3 text-muted-foreground">{REASON[b.reason] ?? b.reason}</td>
                <td className="px-3 text-right tabular text-muted-foreground">{size(b.size)}</td>
                <td className="px-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="size-8" asChild aria-label={`Download ${b.name}`}><a href={`/api/backup/${b.name}`}><Download /></a></Button>
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Restore ${b.name}`} onClick={() => { setRestoring(b); setConfirm(""); }}><RotateCcw /></Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Delete ${b.name}`} disabled={pending}
                      onClick={() => { if (window.confirm(`Delete the backup ${b.name}? It cannot be brought back.`)) start(async () => { const r = await removeStored(b.name); if (r.ok) router.refresh(); else toast.error(r.error); }); }}><Trash2 /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 rounded-md border p-3">
        <div className="text-sm font-medium">Restore from a file</div>
        <p className="text-xs text-muted-foreground">A backup downloaded from this app (for example onto a new server after the old one was lost). Everything here is replaced by it; what is here now is backed up first.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Input type="file" accept=".gz,.json,application/gzip,application/json" className="w-full sm:w-auto" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Backup file" />
          <div className="grid gap-1"><Label htmlFor="fileConfirm" className="text-xs">Type RESTORE</Label><Input id="fileConfirm" className="h-8 w-36" value={fileConfirm} onChange={(e) => setFileConfirm(e.target.value)} /></div>
          <Button variant="destructive" disabled={pending || !file || fileConfirm.trim().toUpperCase() !== "RESTORE"} onClick={() => start(async () => {
            const body = new FormData();
            body.set("file", file!); body.set("confirm", fileConfirm);
            const res = await fetch("/api/backup/restore", { method: "POST", body });
            const r = await res.json().catch(() => ({ ok: false, error: `The server answered ${res.status}.` }));
            if (r.ok) afterRestore(r.message); else toast.error(r.error);
          })}>{pending ? <Loader2 className="animate-spin" /> : <Upload />}Restore</Button>
        </div>
      </div>

      <Dialog open={!!restoring} onOpenChange={(o) => { if (!o) setRestoring(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              Everything now in the app - people, ratings, catalogue, accounts, configuration - is replaced by the backup from {restoring && when(restoring.at)}.
              What is here now is backed up first. Everyone signs in again afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="restoreConfirm">Type RESTORE to confirm</Label><Input id="restoreConfirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoring(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending || confirm.trim().toUpperCase() !== "RESTORE"} onClick={() => start(async () => {
              const r = await restoreStored(restoring!.name, confirm);
              if (r.ok) { setRestoring(null); afterRestore(r.message); } else toast.error(r.error);
            })}>{pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
