"use client";
// A page that failed: say so in plain words, offer to try again, keep the menu.
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 grid max-w-lg gap-3 rounded-lg border bg-card p-6 text-sm">
      <h1 className="text-lg font-semibold">This page could not be shown</h1>
      <p className="text-muted-foreground">Something went wrong while it was put together. Nothing you entered elsewhere is lost. Try again; if it keeps happening, tell an administrator{error.digest ? <> and give them this reference: <code className="rounded bg-muted px-1">{error.digest}</code></> : null}.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}><RotateCw />Try again</Button>
        <Button asChild variant="outline"><Link href="/">Go to Home</Link></Button>
      </div>
    </div>
  );
}
