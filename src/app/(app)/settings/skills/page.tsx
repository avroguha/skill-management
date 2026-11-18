import { asc, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveCategory, deleteCategory } from "@/app/actions/admin";
import { COLUMNS, DESCRIPTIONS } from "@/lib/transfer";
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
  const drafts = skills.filter((s) => s.status === "draft").length;

  return (
    <>
      <PageHeader title="Skills"
        description="The catalogue people rate themselves on: category › skill › sub-skill, for example Cloud › AWS › EC2. Upload a CSV, or add and edit skills one by one." />
      <div className="grid gap-5">
        <Section title="Upload skills from a CSV file"
          info="Adds and updates categories, skills and sub-skills in bulk. Check the file first: nothing is saved until you press Import. A new skill that looks like one already here (similar wording, or one of its aliases) is listed with a choice: keep both, merge it into the existing one, skip it, or replace the existing one with it.">
          <ImportForm kinds={[{ kind: "skills", columns: COLUMNS.skills, description: DESCRIPTIONS.skills }]} />
          <p className="mt-3 text-xs text-muted-foreground">
            Columns: <code>category, skill, sub_skill, aliases, description, status</code>. The easiest template is the current catalogue:{" "}
            <a href="/api/export/skills" className="underline underline-offset-2">download skills.csv</a>, edit it, and upload it again.
          </p>
        </Section>
        <Section title={`Skills (${skills.filter((x) => x.status === "active").length} active)`}
          description={drafts ? `${drafts} suggested by people, waiting for you (status: draft). Approve with ✓, or merge into an existing skill.` : undefined}
          info="Every skill in the catalogue. Only skills without active sub-skills are rated; a skill with sub-skills is a heading. Retire a skill rather than deleting it: its history stays. Merge folds a duplicate into another skill, ratings and all.">
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
              { key: "status", header: "Status", kind: "badge", facet: true, info: "Active: people can rate it. Draft: suggested by someone, waiting for approval. Retired: no longer offered; history stays." },
            ]}
            fields={[
              { name: "name", label: "Name", half: true, info: "What people see and search for. Up to 120 characters." },
              { name: "categoryId", label: "Category", type: "select", half: true, info: "The group it belongs to. A sub-skill always has its parent's category.", options: cats.map((c) => ({ value: c.id, label: c.name })) },
              { name: "parentId", label: "Under (for a sub-skill)", type: "select", optional: true, info: "Makes it a sub-skill of a top-level skill, e.g. EC2 under AWS. People then rate the sub-skills, not the parent.",
                options: skills.filter((s) => !s.parentId && s.status !== "retired").map((s) => ({ value: s.id, label: `${s.name} (${catName.get(s.categoryId)})` })) },
              { name: "aliases", label: "Also known as", placeholder: "K8s, kube", info: "Other names, comma-separated. Search finds the skill by these, and the CSV upload uses them to spot duplicates." },
              { name: "description", label: "Description", type: "textarea", info: "One or two lines on what it covers, shown on the skill's page." },
              { name: "status", label: "Status", type: "select", half: true, info: "Active: rated. Draft: suggested, waiting for approval. Retired: no longer offered; history stays.", options: [
                { value: "active", label: "Active" }, { value: "draft", label: "Draft (suggested)" }, { value: "retired", label: "Retired" },
              ] },
              { name: "sort", label: "Order", type: "number", half: true, info: "Position within its category; lower comes first." },
            ]}
            targets={skills.filter((s) => s.status === "active").map((s) => ({ value: s.id, label: label(s.id) })).sort((a, b) => a.label.localeCompare(b.label))}
          />
        </Section>
        <Section title="Categories" info="The groups skills are shown in, in this order. A category with skills cannot be deleted.">
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
