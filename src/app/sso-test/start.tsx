"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function StartTest({ providerId }: { providerId: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!providerId) { setError("No identity provider is set up yet. Add one in Admin, Single sign-on."); return; }
    authClient.signIn.sso({ providerId, callbackURL: "/sso-test/done", errorCallbackURL: "/sso-test/done" })
      .then(({ error }) => { if (error) setError(error.message ?? "The sign-in could not start."); });
  }, [providerId]);
  return (
    <div className="flex min-h-svh items-center justify-center p-6 text-sm">
      {error ? <p className="text-destructive">{error}</p>
        : <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Going to the identity provider…</p>}
    </div>
  );
}
