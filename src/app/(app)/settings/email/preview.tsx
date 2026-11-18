"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Preview { kind: string; label: string; to: string; subject: string; html: string; text: string }

/** Each e-mail as people will see it (HTML), or as plain text for mail clients without HTML. */
export function EmailPreview({ items }: { items: Preview[] }) {
  const [kind, setKind] = useState(items[0]?.kind);
  const [mode, setMode] = useState<"html" | "text">("html");
  const cur = items.find((i) => i.kind === kind) ?? items[0];
  if (!cur) return null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which e-mail">
        {items.map((i) => (
          <button key={i.kind} type="button" aria-pressed={i.kind === cur.kind} onClick={() => setKind(i.kind)}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors", i.kind === cur.kind ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
            {i.label}
          </button>
        ))}
      </div>
      <div className="grid gap-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <div><span className="text-muted-foreground">To:</span> {cur.to}</div>
        <div><span className="text-muted-foreground">Subject:</span> <b>{cur.subject}</b></div>
        <div className="flex gap-2 text-xs">
          <button type="button" className={cn("underline-offset-2", mode === "html" ? "font-medium" : "text-muted-foreground hover:underline")} onClick={() => setMode("html")}>As most people see it</button>
          <button type="button" className={cn("underline-offset-2", mode === "text" ? "font-medium" : "text-muted-foreground hover:underline")} onClick={() => setMode("text")}>Plain text</button>
        </div>
      </div>
      {mode === "html"
        ? <iframe title={`Preview: ${cur.label}`} srcDoc={cur.html} sandbox="" className="h-[640px] w-full rounded-md border bg-white" />
        : <pre className="max-h-[640px] overflow-auto rounded-md border bg-card p-3 text-xs whitespace-pre-wrap">{cur.text}</pre>}
    </div>
  );
}
