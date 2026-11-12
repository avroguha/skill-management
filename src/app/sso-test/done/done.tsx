"use client";
import { useEffect } from "react";

const TEXT: Record<string, string> = {
  SSO_TEST: "Test sign-in captured. The attributes are on the Single sign-on page.",
  sso_test: "Test sign-in captured. The attributes are on the Single sign-on page.",
  NOT_ALLOWED: "Signed in at the identity provider, but this person is not one of the people the app is for.",
};

export function Done({ error, description }: { error: string | null; description: string | null }) {
  useEffect(() => {
    window.opener?.postMessage({ type: "sso-test-done", error }, window.location.origin);
    const t = setTimeout(() => window.close(), 1500);
    return () => clearTimeout(t);
  }, [error]);
  return (
    <div className="flex min-h-svh items-center justify-center p-6 text-center text-sm">
      <div className="grid gap-1">
        <p className="font-medium">{error ? TEXT[error] ?? `The identity provider answered: ${error}` : "Signed in."}</p>
        {description && !TEXT[error ?? ""] && <p className="text-muted-foreground">{description}</p>}
        <p className="text-xs text-muted-foreground">This window closes by itself.</p>
      </div>
    </div>
  );
}
