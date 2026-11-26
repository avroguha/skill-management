// Requests: asking for a new skill or category, and deciding on what was asked.
//   My requests   what you asked for, where it is and with whom (everyone)
//   To approve    requests waiting for a decision (coordinators and administrators)
//   All requests  everything asked for and what was decided (coordinators and administrators)
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { SubMenu } from "@/components/sub-menu";
import { Info } from "@/components/info";
import { requireViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { REQUEST_SECTIONS, type RequestSection } from "@/lib/menu";
import { getAskCatalogue } from "@/lib/catalogue-view";
import { STATUS_LABEL, type RequestStatus } from "@/lib/requests";
import { fmtDate } from "@/lib/format";
import { withParams } from "@/lib/views";
import { RequestsView, type RequestRow } from "./client";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const engine = await getEngine();
  const db = await getDb();
  const me = v.viewAs ? v.viewAs.byUserId : v.userId;
  const sections = REQUEST_SECTIONS.filter((s) => !s.approver || v.coordinator);
  const asked = sections.find((s) => s.key === param(sp, "tab"))?.key as RequestSection | undefined;
  const all = await db.select().from(schema.catalogueRequest).orderBy(desc(schema.catalogueRequest.updatedAt)).limit(1000);
  const pending = all.filter((r) => r.status === "pending");
  // a coordinator's sections each have their own address, so the menu can show which is open
  if (v.coordinator && !asked) redirect(withParams("/requests", { tab: pending.length ? "approve" : "mine", new: param(sp, "new") }));
  const tab: RequestSection = asked ?? "mine";
  const list = tab === "mine" ? all.filter((r) => r.requestedById === me) : tab === "approve" ? [...pending].reverse() : all;
  const ask = await getAskCatalogue();
  const catName = new Map(ask.categories.map((c) => [c.id, c.name]));

  const rows: RequestRow[] = list.map((r) => {
    const status = r.status as RequestStatus;
    const parent = r.parentId ? engine.skillById.get(r.parentId) : undefined;
    return {
      id: r.id, kind: r.kind as "skill" | "category", name: r.name, description: r.description, reason: r.reason,
      categoryId: r.categoryId, categoryName: r.categoryName, parentId: r.parentId,
      place: r.kind === "category" ? "" : [r.categoryId ? catName.get(r.categoryId) ?? "a category that was removed" : r.categoryName ? `${r.categoryName} (a new category)` : "", parent ? `under ${parent.name}` : ""].filter(Boolean).join(" · "),
      status, statusLabel: STATUS_LABEL[status] ?? r.status,
      by: r.requestedByName || "Someone (suggested before requests existed)", mine: r.requestedById === me, when: fmtDate(r.createdAt),
      decidedBy: r.decidedByName, decidedWhen: r.decidedAt ? fmtDate(r.decidedAt) : "", comment: r.comment,
      resultHref: status === "approved" && r.resultId ? (r.kind === "skill" ? `/skills/${r.resultId}` : "/skills") : null,
      history: r.history.map((h) => ({ when: fmtDate(h.at), by: h.by, action: h.action, note: h.note })),
    };
  });
  const returnedMine = all.filter((r) => r.requestedById === me && r.status === "returned").length;

  return (
    <>
      <PageHeader title="Requests"
        description={<span className="inline-flex flex-wrap items-center gap-1.5">Ask for a skill or a category that is missing from the catalogue, and follow what happens to it.
          <Info label="About requests">Skills and categories are the same for everyone, so a new one is approved first. Anyone can ask. A request goes to {ask.approvers}, who approves it, sends it back with a note to change it, or says no with a reason. You always see where your request is and with whom.</Info></span>} />
      {sections.length > 1 && (
        <SubMenu label="Requests" active={tab} items={sections.map((s) => ({
          key: s.key, label: s.label, hint: s.hint, href: `/requests?tab=${s.key}`,
          ...(s.key === "approve" ? { count: pending.length, attention: true } : s.key === "mine" && returnedMine ? { count: returnedMine, attention: true } : {}),
        }))} />
      )}
      <RequestsView rows={rows} tab={tab} canDecide={v.coordinator} ask={ask} readOnly={!!v.viewAs} openNew={param(sp, "new") === "skill" || param(sp, "new") === "category" ? (param(sp, "new") as "skill" | "category") : null} />
    </>
  );
}
