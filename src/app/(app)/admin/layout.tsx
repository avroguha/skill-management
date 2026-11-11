import { requireAdmin } from "@/lib/server";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid gap-5">
      <AdminNav />
      <div>{children}</div>
    </div>
  );
}
