"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shapes, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ providers, demo, error }: {
  providers: { providerId: string; domain: string }[];
  demo: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"local" | "sso" | null>(null);
  const [message, setMessage] = useState<string | null>(error === "NOT_ALLOWED" ? "Signed in at your company, but you are not one of the people this app is for. Ask an administrator." : error ? "Single sign-on did not complete. Try again or use a local account." : null);
  const [ssoEmail, setSsoEmail] = useState("");

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("local");
    setMessage(null);
    const { error } = await authClient.signIn.username({
      username: String(f.get("username") ?? "").trim(),
      password: String(f.get("password") ?? ""),
    });
    setBusy(null);
    if (error) {
      setMessage(
        error.status === 429 ? "Too many attempts. Wait a minute and try again."
          : error.code === "BANNED_USER" ? "This account is disabled. Sign in with single sign-on, or ask an administrator."
            : "That username and password do not match.",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function sso(providerId?: string) {
    setBusy("sso");
    setMessage(null);
    const { error } = await authClient.signIn.sso({
      ...(providerId ? { providerId } : { email: ssoEmail.trim() }),
      callbackURL: "/",
      errorCallbackURL: "/login?error=sso",
    });
    if (error) {
      setBusy(null);
      setMessage(error.message || "No single sign-on is set up for that address.");
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Shapes className="size-5" />
        </div>
        <CardTitle className="text-lg">Skill Management</CardTitle>
        <CardDescription>Sign in to continue</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {providers.length > 0 && (
          <div className="grid gap-2">
            {providers.length === 1 ? (
              <Button className="w-full" onClick={() => sso(providers[0].providerId)} disabled={!!busy}>
                {busy === "sso" ? <Loader2 className="animate-spin" /> : <Building2 />}
                Sign in with single sign-on
              </Button>
            ) : (
              <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); sso(); }}>
                <Label htmlFor="sso-email">Work e-mail</Label>
                <Input id="sso-email" type="email" placeholder="you@company.com" value={ssoEmail} onChange={(e) => setSsoEmail(e.target.value)} required />
                <Button type="submit" disabled={!!busy}>
                  {busy === "sso" ? <Loader2 className="animate-spin" /> : <Building2 />}
                  Continue with single sign-on
                </Button>
              </form>
            )}
            <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
              <Separator className="flex-1" />or a local account<Separator className="flex-1" />
            </div>
          </div>
        )}
        <form className="grid gap-3" onSubmit={signIn}>
          <div className="grid gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username" autoFocus required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          <Button type="submit" variant={providers.length ? "outline" : "default"} disabled={!!busy}>
            {busy === "local" && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
        {demo && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Demo data is loaded. Try <b>exec</b>, <b>manager</b> or <b>employee</b> with password <b>demo</b> to see each audience,
            or <b>admin</b> for setup.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
