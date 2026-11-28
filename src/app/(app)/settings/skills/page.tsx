import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveCategory, deleteCategory } from "@/app/actions/admin";
import { COLUMNS, DESCRIPTIONS } from "@/lib/transfer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/info";
import { ImportForm } from "../data/client";
import { SkillsAdmin } from "./client";

export const metadata = { title: "Skills · Settings" };

export default async function SkillsSettings() {
  const db = await getDb();
  const [cats, skills, ratingCounts] = await Promise.all([
    db.select().from(schema.skillCategory).orderBy(asc(schema.skillCategory.sort)),
    db.select().from(schema.skill),
    db.select({ skillId: schema.rating.skillId, n: count() }).from(schema.rating).groupBy(schema.rating.skillId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const byId = new Map(skills.map((s) => [s.id, s]));
  const label = (id: string) => {
    const s = byId.get(id)!;
    const p = s.parentId ? byId.get(s.parentId) : undefined;
    return p ? `${p.name} › ${s.name}` : s.name;
  };
  const rated = new Map(ratingCounts.map((r) => [r.skillId, r.n]));
  const waiting = (await db.select({ id: schema.catalogueRequest.id }).from(schema.catalogueRequest).where(eq(schema.catalogueRequest.status, "pending"))).length;

  return (
    <>
      <PageHeader title="Skills"
        description="The catalogue people rate themselves on: category › skill › sub-skill, for example Cloud › AWS › EC2. Upload a CSV, or add and edit skills one by one." />
      <div className="grid gap-5">
        <Section title="Download and upload skills (CSV)"
          info="Bulk changes in three steps: download the catalogue, change it in Excel, upload it back. An upload updates and adds; it never deletes (retire a skill with status = retired). Check it first: nothing is saved until you press Import.">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm"><a href="/api/export/skills"><Download />Download the catalogue (skills.csv)</a></Button>
            <Button asChild variant="outline" size="sm"><a href="/api/export/starter-skills"><Download />Download the starter catalogue</a></Button>
            <Info label="About the two downloads">
              <b>The catalogue</b> is every skill here now: the easiest template, and a backup before a big change.
              <b> The starter catalogue</b> is what the app ships with: technical skills grouped by technology (cloud,
              software, data, security, operations) and three categories every kind of work needs: Managerial, Analytical
              and Business. It is loaded by itself on a fresh install. Upload it here to add any you do not have yet;
              skills you already have are updated, nothing is removed. To go back to it entirely, use Reset in Data &amp; backups.
            </Info>
          </div>
          <ImportForm kinds={[{ kind: "skills", columns: COLUMNS.skills, description: DESCRIPTIONS.skills }]} />
          <ul className="mt-3 grid list-disc gap-0.5 pl-5 text-xs text-muted-foreground">
            <li><b>Upsert</b>: a skill (or sub-skill) whose name is already here is <b>updated</b> from the columns the file has: category, aliases, description, status, order. A column the file leaves out keeps what is there.</li>
            <li>A skill that is not here is <b>added</b>; a new category is created as needed. Nothing is ever deleted.</li>
            <li>A new skill that only <b>looks like</b> one already here (similar wording, or one of its aliases) is listed first, with a choice: merge, replace, keep both or skip.</li>
          </ul>
        </Section>
        <Section title={`Skills (${skills.filter((x) => x.status === "active").length} active)`}
          description={waiting ? <>{waiting} request{waiting === 1 ? "" : "s"} for a new skill or category {waiting === 1 ? "waits" : "wait"} for a decision: <Link href="/requests?tab=approve" className="font-medium text-foreground underline-offset-2 hover:underline">open Requests</Link>.</> : undefined}
          info="Every skill in the catalogue: the same for every team. Administrators add and change skills here; everyone else asks for a new one under Requests, and a coordinator approves it. Only skills without active sub-skills are rated; a skill with sub-skills is a heading. Retire a skill rather than deleting it: its history stays. Merge folds a duplicate into another skill, ratings and all.">
          <SkillsAdmin
            rows={skills.map((s) => ({
              id: s.id, name: s.name, categoryId: s.categoryId, parentId: s.parentId ?? "none", description: s.description,
              aliases: s.aliases.join(", "), status: s.status, sort: s.sort,
              label: label(s.id), category: catName.get(s.categoryId) ?? "", ratings: rated.get(s.id) ?? 0,
              subs: skills.filter((x) => x.parentId === s.id).length || null, href: `/skills/${s.id}`,
            })).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))}
            columns={[
              { key: "label", header: "Skill", kind: "link", hrefKey: "href" },
              { key: "category", header: "Category", facet: true },
              { key: "aliases", header: "Also known as", kind: "muted", info: "Other names for it: search finds the skill by these too." },
              { key: "subs", header: "Sub-skills", kind: "number", align: "right" },
              { key: "ratings", header: "Ratings", kind: "number", align: "right", info: "How many people have rated it. A skill with ratings cannot be deleted, only retired or merged." },
              { key: "status", header: "Status", kind: "badge", facet: true, info: "Active: people can rate it. Retired: no longer offered; history stays." },
            ]}
            fields={[
              { name: "name", label: "Name", info: "What people see and search for. Unique (within its skill, for a sub-skill): skills with a name like it are listed as you type.",
                similar: { noun: "skill", items: skills.filter((s) => s.status !== "retired").map((s) => ({ id: s.id, name: label(s.id), aliases: [s.name, ...s.aliases], hint: catName.get(s.categoryId) ?? "", href: `/skills/${s.id}` })) } },
              { name: "categoryId", label: "Category", type: "select", info: "The group it belongs to. A sub-skill always has its parent’s category.", options: cats.map((c) => ({ value: c.id, label: c.name })) },
              { name: "parentId", label: "Under (for a sub-skill)", type: "select", optional: true, info: "Makes it a sub-skill of a top-level skill, e.g. EC2 under AWS. People then rate the sub-skills, not the parent.",
                options: skills.filter((s) => !s.parentId && s.status !== "retired").map((s) => ({ value: s.id, label: `${s.name} (${catName.get(s.categoryId)})` })) },
              { name: "aliases", label: "Also known as", placeholder: "K8s, kube", info: "Other names, comma-separated. Search finds the skill by these, and the CSV upload uses them to spot duplicates." },
              { name: "description", label: "Description", type: "textarea", info: "One or two lines on what it covers, shown on the skill’s page." },
              { name: "status", label: "Status", type: "select", half: true, info: "Active: rated. Retired: no longer offered; history stays.", options: [
                { value: "active", label: "Active" }, { value: "retired", label: "Retired" },
              ] },
              { name: "sort", label: "Order", type: "number", half: true, info: "Position within its category; lower comes first." },
            ]}
            targets={skills.filter((s) => s.status === "active").map((s) => ({ value: s.id, label: label(s.id) })).sort((a, b) => a.label.localeCompare(b.label))}
          />
        </Section>
        <Section title="Categories" info="The groups skills are shown in, in this order: the same for every team. A category with skills cannot be deleted. Everyone else asks for a new category under Requests.">
          <AdminCrud noun="category"
            rows={cats.map((c) => ({ id: c.id, name: c.name, description: c.description, sort: c.sort, skills: skills.filter((s) => s.categoryId === c.id).length }))}
            columns={[
              { key: "name", header: "Category" },
              { key: "description", header: "Description", kind: "muted" },
              { key: "skills", header: "Skills", kind: "number", align: "right" },
              { key: "sort", header: "Order", kind: "number", align: "right" },
            ]}
            defaults={{ sort: (cats.at(-1)?.sort ?? 0) + 1 }}
            fields={[
              { name: "name", label: "Name", half: true, info: "Shown as a heading and a filter chip." },
              { name: "sort", label: "Order", type: "number", half: true, info: "Lower comes first." },
              { name: "description", label: "Description", type: "textarea", info: "What belongs in this category." },
            ]}
            save={saveCategory} remove={deleteCategory} />
        </Section>
      </div>
    </>
  );
}
