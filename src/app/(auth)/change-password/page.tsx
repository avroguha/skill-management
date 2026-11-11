import { requireViewer } from "@/lib/server";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const v = await requireViewer({ allowPasswordChange: true });
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <ChangePasswordForm forced={v.mustChangePassword} />
    </div>
  );
}
