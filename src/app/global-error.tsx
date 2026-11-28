"use client";
// A failure above every page, e.g. the frame around them could not read the database. It
// replaces the whole document, so it brings its own <html> and <body>.
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <main role="alert" className="mx-auto mt-16 grid max-w-lg gap-3 rounded-lg border bg-card p-6 text-sm">
          <h1 className="text-lg font-semibold">Skill Management could not be shown</h1>
          <p className="text-muted-foreground">Something it needs did not answer, often the database for a moment. Nothing you saved is lost. Try again; if it keeps happening, tell an administrator{error.digest ? <> and give them this reference: <code className="rounded bg-muted px-1">{error.digest}</code></> : null}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">Try again</button>
            {/* a full load, not a client-side move: the frame itself is what failed */}
            <a href="/" className="rounded-md border px-3 py-1.5 font-medium">Go to Home</a>
          </div>
        </main>
      </body>
    </html>
  );
}
