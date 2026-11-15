"use client";
import { useEffect } from "react";

const TEXT: Record<string, string> = {
  SSO_TEST: "Test sign-in captured. Map what came back below, then save.",
  sso_test: "Test sign-in captured. Map what came back below, then save.",
  NOT_ALLOWED: "Signed in at the identity provider, but this person is not allowed to use the app.",
};

/** Tells the admin page the test is back; closes the pop-up unless it stays for the mapping. */
export function Done({ error, description, stay = false }: { error: string | null; description: string | null; stay?: boolean }) {
  useEffect(() => {
    window.opener?.postMessage({ type: "sso-test-done", error }, window.location.origin);
    if (stay) return;
    const t = setTimeout(() => window.close(), 1500);
    return () => clearTimeout(t);
  }, [error, stay]);
  if (stay) {
    return (
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Single sign-on test</h1>
        <p className="text-sm text-muted-foreground">{TEXT[error ?? ""]} Nobody was signed in.</p>
      </div>
    );
  }
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
