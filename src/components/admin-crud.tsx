"use client";
// A list with add / edit / delete for any admin entity, driven by a field list.
import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTable, type ColSpec } from "@/components/data-table";
import { cn } from "@/lib/utils";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
type Data = Record<string, unknown>;

export interface Field {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "number" | "switch" | "email" | "date" | "password";
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  half?: boolean;
  /** shown only when creating */
  createOnly?: boolean;
  /** "none" choice for an optional select */
  optional?: boolean;
}

export function RecordDialog({ title, description, fields, initial, save, onClose }: {
  title: string; description?: string; fields: Field[]; initial: Data; save: (d: Data) => Promise<Result>; onClose: () => void;
}) {
  const [values, setValues] = useState<Data>(initial);
  const [pending, start] = useTransition();
  const creating = !initial.id;
  const set = (k: string, v: unknown) => setValues((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await save(values);
            if (r.ok) { toast.success(r.message ?? "Saved"); onClose(); } else toast.error(r.error);
          });
        }}>
          {fields.filter((f) => creating || !f.createOnly).map((f) => {
            const id = `fld-${f.name}`;
            const v = values[f.name];
            return (
              <div key={f.name} className={cn("grid gap-1.5", f.half ? "col-span-1" : "col-span-2")}>
                {f.type !== "switch" && <Label htmlFor={id}>{f.label}</Label>}
                {f.type === "textarea" ? (
                  <Textarea id={id} rows={3} value={String(v ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
                ) : f.type === "select" ? (
                  <Select value={v == null || v === "" ? (f.optional ? "none" : undefined) : String(v)} onValueChange={(x) => set(f.name, x)}>
                    <SelectTrigger id={id} className="w-full"><SelectValue placeholder={f.placeholder ?? "Choose…"} /></SelectTrigger>
                    <SelectContent>
                      {f.optional && <SelectItem value="none">—</SelectItem>}
                      {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : f.type === "switch" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch id={id} checked={v === true || v === "true"} onCheckedChange={(c) => set(f.name, c)} />
                    <Label htmlFor={id} className="font-normal">{f.label}</Label>
                  </div>
                ) : (
                  <Input id={id} type={f.type ?? "text"} value={String(v ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
                )}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            );
          })}
          <DialogFooter className="col-span-2">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDelete({ what, onConfirm, onClose }: { what: string; onConfirm: () => Promise<Result>; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone. It is refused if anything still depends on it.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await onConfirm();
              if (r.ok) toast.success(r.message ?? "Deleted"); else toast.error(r.error);
              onClose();
            });
          }}>{pending && <Loader2 className="animate-spin" />}Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AdminCrud({ rows, columns, fields, save, remove, noun, defaults, csvName, description, nameKey = "name", searchKeys, extraActions, canAdd = true, pageSize }: {
  rows: Data[];
  columns: ColSpec[];
  fields: Field[];
  save: (d: Data) => Promise<Result>;
  remove?: (id: string) => Promise<Result>;
  noun: string;
  defaults?: Data;
  csvName?: string;
  description?: string;
  nameKey?: string;
  searchKeys?: string[];
  extraActions?: (row: Data) => React.ReactNode;
  canAdd?: boolean;
  pageSize?: number;
}) {
  const [editing, setEditing] = useState<Data | null>(null);
  const [deleting, setDeleting] = useState<Data | null>(null);
  return (
    <>
      <DataTable rows={rows} columns={columns} csvName={csvName} searchKeys={searchKeys} pageSize={pageSize}
        toolbar={canAdd ? <Button size="sm" className="h-8" onClick={() => setEditing({ ...(defaults ?? {}) })}><Plus />Add {noun}</Button> : undefined}
        actions={(row) => (
          <>
            {extraActions?.(row)}
            <Button variant="ghost" size="icon" aria-label={`Edit ${String(row[nameKey])}`} onClick={() => setEditing(row)}><Pencil className="size-3.5" /></Button>
            {remove && <Button variant="ghost" size="icon" aria-label={`Delete ${String(row[nameKey])}`} onClick={() => setDeleting(row)}><Trash2 className="size-3.5" /></Button>}
          </>
        )} />
      {editing && (
        <RecordDialog title={editing.id ? `Edit ${noun}` : `Add ${noun}`} description={description} fields={fields}
          initial={editing} save={save} onClose={() => setEditing(null)} />
      )}
      {deleting && remove && (
        <ConfirmDelete what={`${noun} “${String(deleting[nameKey])}”`} onConfirm={() => remove(String(deleting.id))} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}
