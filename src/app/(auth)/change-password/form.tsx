"use client";
import { useActionState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/app/actions/account";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KeyRound className="size-5" />
        </div>
        <CardTitle className="text-lg">{forced ? "Set your own password" : "Change password"}</CardTitle>
        <CardDescription>
          {forced ? "This account still has its first password. Choose a new one before you continue." : "At least 10 characters."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="next">New password</Label>
            <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm">New password again</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save password
          </Button>
          {!forced && <Button variant="ghost" asChild><Link href="/">Cancel</Link></Button>}
        </form>
      </CardContent>
    </Card>
  );
}
