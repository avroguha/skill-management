"use client";
// The (i) next to every field, tile, column and section: what the data is, or what the
// setting changes. A tap or click opens it (works on phones; no hover needed), Escape or a
// click elsewhere closes it.
import { Info as InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Info({ children, label = "What is this?", className, side = "top" }: {
  children: React.ReactNode;
  /** for screen readers: what the (i) explains */
  label?: string;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} data-info
          className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className)}
          onClick={(e) => e.stopPropagation()}>
          <InfoIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} collisionPadding={12} className="w-72 max-w-[calc(100vw-2rem)] text-sm leading-relaxed">
        {/* one block, so bold words and links stay in the sentence (the popover lays out its children as flex items) */}
        <div className="space-y-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A form field with its label, its (i) and an optional short hint under the control. Every
 * setting is built with this, so none can be added without saying what it does
 * (test/info.test.ts checks the settings pages use no bare <Label>).
 */
export function Field({ label, info, htmlFor, hint, children, className }: {
  label: string;
  info: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        <Info label={`About ${label}`}>{info}</Info>
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A label with its (i), for forms laid out by hand. */
export function LabelInfo({ htmlFor, info, children, className }: { htmlFor?: string; info: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className={className}>{children}</Label>
      <Info label="About this field">{info}</Info>
    </span>
  );
}

/** A switch or checkbox row: the control, its label and its (i). */
export function ToggleField({ label, info, children }: { label: string; info: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <label className="flex items-center gap-2">{children}<span>{label}</span></label>
      <Info label={`About ${label}`}>{info}</Info>
    </div>
  );
}
