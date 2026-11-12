"use client";
// A value to copy into another system (an SSO setting, an integration key or URL).
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyValue({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-start gap-1">
        <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1.5 font-mono text-xs break-all">{value}</code>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Copy ${label}`}
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
            catch { toast.error("Copy failed: select the text and copy it."); }
          }}>
          {copied ? <Check className="text-status-meets-fg dark:text-foreground" /> : <Copy />}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
