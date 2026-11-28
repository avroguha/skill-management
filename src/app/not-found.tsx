// An address that matches no page at all (a typo, an old link). Inside the app, a page that
// is not there or not yours shows (app)/not-found.tsx, with the menu.
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Nothing here" };

export default function NotFound() {
  return (
    <main className="mx-auto mt-16 grid max-w-lg gap-3 rounded-lg border bg-card p-6 text-sm">
      <h1 className="text-lg font-semibold">Nothing here</h1>
      <p className="text-muted-foreground">There is no page at this address. It may be mistyped, or an old link.</p>
      <div><Button asChild><Link href="/">Go to Home</Link></Button></div>
    </main>
  );
}
