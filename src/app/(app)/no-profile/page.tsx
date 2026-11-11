import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer } from "@/lib/server";

export const metadata = { title: "No profile" };

export default async function NoProfilePage() {
  const v = await requireViewer();
  return (
    <>
      <PageHeader title={`Welcome, ${v.name}`} />
      <Empty>
        Your account ({v.email}) is not linked to an employee record yet, so there is nothing to show.
        Accounts are linked automatically when the e-mail address matches; otherwise an administrator links them in Admin › Users.
      </Empty>
    </>
  );
}
