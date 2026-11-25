// "Every field should have an (i)": the settings pages may not use a bare <Label> (only
// Field, ToggleField, LabelInfo or the settings record dialog, which all carry one), every
// tile says what it shows, and every page title in the navigation is one click away.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith(".tsx") ? [path.join(dir, d.name)] : []));
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");

test("settings pages and the forms people fill in use no bare <Label>: every field has its (i)", () => {
  const files = [
    ...walk(path.join(root, "src", "app", "(app)", "settings")),
    path.join(root, "src", "app", "(app)", "team", "needs.tsx"),
    path.join(root, "src", "components", "admin-crud.tsx"),
  ];
  const bare: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    // admin-crud renders its Label next to the field's required info
    const uses = src.match(/<Label[\s>]/g)?.length ?? 0;
    if (!uses) continue;
    if (rel(f) === "src/components/admin-crud.tsx" && /<Info label=\{`About \$\{f\.label\}`\}>\{f\.info\}<\/Info>/.test(src)) continue;
    bare.push(`${rel(f)} (${uses})`);
  }
  assert.deepEqual(bare, [], "use Field, ToggleField or LabelInfo from components/info");
});

test("a settings field cannot be declared without saying what it does", () => {
  const src = fs.readFileSync(path.join(root, "src", "components", "admin-crud.tsx"), "utf8");
  assert.match(src, /\n {2}info: string;/, "Field.info is required, so the compiler refuses a field without it");
});

test("every number tile says what it shows", () => {
  const src = fs.readFileSync(path.join(root, "src", "components", "kpi.tsx"), "utf8");
  assert.match(src, /\n {2}info: string;/, "Kpi.info is required");
});

test("settings: every section is in the menu (the sub menu under Settings), and has a page", async () => {
  const { SETTINGS_SECTIONS } = await import("../src/lib/menu.ts");
  const hrefs = SETTINGS_SECTIONS.map((x) => x.href as string);
  assert.ok(hrefs.length >= 10);
  for (const h of hrefs) {
    const page = path.join(root, "src", "app", "(app)", ...h.split("/").filter(Boolean), "page.tsx");
    assert.ok(fs.existsSync(page), `${h} has a page`);
  }
});
