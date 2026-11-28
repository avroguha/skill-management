// An address with nothing behind it, or something this person may not see.
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto mt-10 grid max-w-lg gap-3 rounded-lg border bg-card p-6 text-sm">
      <h1 className="text-lg font-semibold">Nothing here</h1>
      <p className="text-muted-foreground">This page does not exist, was removed, or is not yours to see. The menu on the left has everything you can open; Find (Ctrl K) takes what you want to do in your own words.</p>
      <div><Button asChild><Link href="/">Go to Home</Link></Button></div>
    </div>
  );
}
