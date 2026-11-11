import { asc, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveCategory, deleteCategory } from "@/app/actions/admin";
import { SkillsAdmin } from "./client";

export const metadata = { title: "Taxonomy · Admin" };

export default async function TaxonomyAdmin() {
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
      <PageHeader title="Taxonomy"
        description="Category › skill › sub-skill, for example Cloud › AWS › EC2. One skill entity for the whole organisation; roles differ only in the level they ask for." />
      <div className="grid gap-5">
        <Section title="Skills" description={drafts ? `${drafts} suggested by employees, waiting for approval (status: draft). Approve with ✓, or merge into an existing skill.` : "Retire a skill instead of deleting it: its history stays."}>
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
              { key: "aliases", header: "Also known as", kind: "muted" },
              { key: "subs", header: "Sub-skills", kind: "number", align: "right" },
              { key: "ratings", header: "Ratings", kind: "number", align: "right" },
              { key: "status", header: "Status", kind: "badge", facet: true },
            ]}
            fields={[
              { name: "name", label: "Name", half: true },
              { name: "categoryId", label: "Category", type: "select", half: true, options: cats.map((c) => ({ value: c.id, label: c.name })) },
              { name: "parentId", label: "Under (for a sub-skill)", type: "select", optional: true,
                options: skills.filter((s) => !s.parentId && s.status !== "retired").map((s) => ({ value: s.id, label: `${s.name} (${catName.get(s.categoryId)})` })) },
              { name: "aliases", label: "Also known as", placeholder: "K8s, kube", help: "Comma-separated. Used when searching and when merging duplicates." },
              { name: "description", label: "Description", type: "textarea" },
              { name: "status", label: "Status", type: "select", half: true, options: [
                { value: "active", label: "Active" }, { value: "draft", label: "Draft (suggested)" }, { value: "retired", label: "Retired" },
              ] },
              { name: "sort", label: "Order", type: "number", half: true },
            ]}
            targets={skills.filter((s) => s.status === "active").map((s) => ({ value: s.id, label: label(s.id) })).sort((a, b) => a.label.localeCompare(b.label))}
          />
        </Section>
        <Section title="Categories">
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
              { name: "name", label: "Name", half: true },
              { name: "sort", label: "Order", type: "number", half: true },
              { name: "description", label: "Description", type: "textarea" },
            ]}
            save={saveCategory} remove={deleteCategory} />
        </Section>
      </div>
    </>
  );
}
