// What an integration (Power BI, Tableau, Excel, anything that reads JSON, CSV or OData)
// can read: flat tables built from the same engine the pages use, manager-validated
// levels. Each dataset declares its columns with a type, which drives the CSV header,
// the JSON field order and the OData $metadata. Rows are built once per data version.
import { pct, type Dataset, type Engine } from "../engine/engine.ts";

export type ColType = "string" | "int" | "decimal" | "bool" | "datetime";
export interface Column { name: string; type: ColType; description: string }
export type Row = Record<string, string | number | boolean | null>;

export interface DatasetDef {
  key: string;
  /** OData entity set name: letters only */
  entity: string;
  title: string;
  description: string;
  columns: Column[];
  rows: (engine: Engine, ds: Dataset) => Row[];
}

const c = (name: string, type: ColType, description: string): Column => ({ name, type, description });
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const DATASETS: DatasetDef[] = [
  {
    key: "people", entity: "People", title: "People",
    description: "Everyone active: unit, manager, role, grade, and how far their required skills are on target.",
    columns: [
      c("id", "string", "Person id"), c("name", "string", "Name"), c("email", "string", "E-mail"), c("title", "string", "Designation"),
      c("unit_id", "string", "Unit id"), c("unit", "string", "Unit"), c("manager_id", "string", "Manager's person id"), c("manager", "string", "Manager"),
      c("role", "string", "Role"), c("grade", "string", "Grade"), c("location", "string", "Location"),
      c("required", "int", "Required skill ratings"), c("on_target", "int", "Of those, at or above target"),
      c("assessed", "int", "Of those, with a validated level"), c("on_target_pct", "int", "On target, percent"),
    ],
    rows: (e, ds) => {
      const roles = new Map(ds.roles.map((r) => [r.id, r.name]));
      return [...e.empById.values()].filter((p) => p.active).map((p) => {
        const a = e.aggregate([p]);
        return {
          id: p.id, name: p.name, email: p.email, title: p.title, unit_id: p.unitId, unit: p.unitId ? e.unitById.get(p.unitId)?.name ?? null : null,
          manager_id: p.managerId, manager: p.managerId ? e.empById.get(p.managerId)?.name ?? null : null,
          role: p.roleId ? roles.get(p.roleId) ?? null : null, grade: p.gradeId ? e.gradeById.get(p.gradeId)?.name ?? null : null,
          location: p.location ?? null, required: a.required, on_target: a.met, assessed: a.assessed, on_target_pct: a.pct,
        };
      });
    },
  },
  {
    key: "units", entity: "Units", title: "Units",
    description: "The organisation tree with each unit's headcount (everyone below it), capability and uncovered team needs.",
    columns: [
      c("id", "string", "Unit id"), c("name", "string", "Name"), c("kind", "string", "Kind"), c("parent_id", "string", "Parent unit id"),
      c("manager_id", "string", "Manager's person id"), c("manager", "string", "Manager"), c("people", "int", "People in it and below"),
      c("on_target_pct", "int", "Required skill ratings on target, percent"), c("assessed_pct", "int", "Required skill ratings assessed, percent"),
      c("critical_gaps", "int", "Team needs nobody covers"), c("single_points", "int", "Team needs only one person covers"),
    ],
    rows: (e) => [...e.unitById.values()].map((u) => {
      const members = e.membersOf(u.id);
      const a = e.aggregate(members);
      const cov = e.coverageIn(u.id);
      return {
        id: u.id, name: u.name, kind: u.kind, parent_id: u.parentId, manager_id: u.managerId,
        manager: u.managerId ? e.empById.get(u.managerId)?.name ?? null : null, people: members.length,
        on_target_pct: a.pct, assessed_pct: pct(a.assessed, a.required),
        critical_gaps: cov.filter((x) => x.critical).length, single_points: cov.filter((x) => x.spof).length,
      };
    }),
  },
  {
    key: "skills", entity: "Skills", title: "Skill catalogue",
    description: "Every skill and sub-skill with its category.",
    columns: [c("id", "string", "Skill id"), c("name", "string", "Name"), c("full_name", "string", "Parent › skill"), c("category", "string", "Category"), c("parent_id", "string", "Parent skill id"), c("status", "string", "active, draft or retired")],
    rows: (e) => [...e.skillById.values()].map((s) => ({
      id: s.id, name: s.name, full_name: e.skillLabel(s.id), category: e.categoryById.get(s.categoryId)?.name ?? null, parent_id: s.parentId, status: s.status,
    })),
  },
  {
    key: "ratings", entity: "Ratings", title: "Ratings",
    description: "One row per person and skill they rated or need: self and validated level, their target, the gap.",
    columns: [
      c("person_id", "string", "Person id"), c("person", "string", "Person"), c("unit_id", "string", "Unit id"), c("skill_id", "string", "Skill id"),
      c("skill", "string", "Skill"), c("category", "string", "Category"), c("self_level", "int", "Self-assessed level"),
      c("validated_level", "int", "Manager-validated level"), c("status", "string", "draft, submitted, validated or returned"),
      c("target", "int", "Their target"), c("required", "bool", "The target is mandatory"), c("gap", "string", "meets, minor, significant, critical, unassessed or not_required"),
      c("wants_it", "bool", "Marked as a skill they want to grow"), c("validated_at", "datetime", "When the level was validated"), c("stale", "bool", "Validated longer ago than the stale period"),
    ],
    rows: (e) => {
      const out: Row[] = [];
      for (const p of e.empById.values()) {
        if (!p.active) continue;
        const ids = new Set([...e.requiredSkillIds(p), ...e.ratingsOf(p.id).map((r) => r.skillId)]);
        for (const sid of ids) {
          if (!e.isRateable(sid)) continue;
          const cell = e.cell(p, sid);
          const r = e.rating(p.id, sid);
          out.push({
            person_id: p.id, person: p.name, unit_id: p.unitId, skill_id: sid, skill: e.skillLabel(sid),
            category: e.categoryById.get(e.skillById.get(sid)?.categoryId ?? "")?.name ?? null,
            self_level: r?.selfLevel ?? null, validated_level: r?.validatedLevel ?? null, status: r?.status ?? null,
            target: cell.target, required: cell.mandatory && cell.target != null, gap: cell.category,
            wants_it: !!r?.interest, validated_at: iso(r?.validatedAt), stale: cell.stale,
          });
        }
      }
      return out;
    },
  },
  {
    key: "team-needs", entity: "TeamNeeds", title: "Team needs",
    description: "What each team needs (set by its manager, or implied by its people's roles) and how many cover it.",
    columns: [
      c("unit_id", "string", "Unit id"), c("unit", "string", "Unit"), c("skill_id", "string", "Skill id"), c("skill", "string", "Skill"),
      c("level", "int", "Level needed"), c("headcount", "int", "People needed at that level"), c("have", "int", "People who have it"),
      c("shortfall", "int", "People missing"), c("single_point", "bool", "Only one person has it"), c("nobody", "bool", "Nobody has it"),
      c("set_by_manager", "bool", "Set by the manager (otherwise implied by roles)"),
    ],
    rows: (e) => {
      const out: Row[] = [];
      for (const u of e.unitById.values()) for (const d of e.demands(u.id)) {
        const cv = e.coverage(d);
        out.push({
          unit_id: u.id, unit: u.name, skill_id: d.skillId, skill: e.skillLabel(d.skillId), level: d.level, headcount: d.headcount,
          have: cv.count, shortfall: cv.shortfall, single_point: cv.spof, nobody: cv.critical, set_by_manager: d.explicit,
        });
      }
      return out;
    },
  },
  {
    key: "talent", entity: "Talent", title: "Talent by unit",
    description: "Per unit and skill (everyone at and below the unit): how many hold it, at what depth, who needs it, who has it beyond their role.",
    columns: [
      c("unit_id", "string", "Unit id"), c("unit", "string", "Unit"), c("skill_id", "string", "Skill id"), c("skill", "string", "Skill"),
      c("holders", "int", "Rated level 1 or above"), c("level3_plus", "int", "At level 3 or above"), c("level4_plus", "int", "At level 4 or above"),
      c("avg_level", "decimal", "Average level of those who hold it"), c("need_it", "int", "People whose target asks for it"),
      c("on_target", "int", "Of those, at or above target"), c("on_target_pct", "int", "On target, percent"),
      c("beyond_role", "int", "Level 3+ without their target asking for it"), c("want_it", "int", "Marked as wanted"),
    ],
    rows: (e) => {
      const out: Row[] = [];
      for (const u of e.unitById.values()) for (const s of e.talent(u.id).skills.values()) {
        if (!e.isRateable(s.skillId)) continue;
        out.push({
          unit_id: u.id, unit: u.name, skill_id: s.skillId, skill: e.skillLabel(s.skillId), holders: s.holders, level3_plus: s.proficient,
          level4_plus: s.expert, avg_level: s.holders ? Math.round((s.levelSum / s.holders) * 100) / 100 : null, need_it: s.needed,
          on_target: s.onTarget, on_target_pct: pct(s.onTarget, s.needed), beyond_role: s.extra, want_it: s.interested,
        });
      }
      return out;
    },
  },
];

export const DATASET_KEYS = DATASETS.map((d) => d.key);
export const datasetByKey = (key: string) => DATASETS.find((d) => d.key === key);
export const datasetByEntity = (entity: string) => DATASETS.find((d) => d.entity === entity);

// rows once per engine (a new engine = a new data version)
const memo = new WeakMap<Engine, Map<string, Row[]>>();
export function datasetRows(def: DatasetDef, engine: Engine, ds: Dataset): Row[] {
  let m = memo.get(engine);
  if (!m) { m = new Map(); memo.set(engine, m); }
  let rows = m.get(def.key);
  if (!rows) { rows = def.rows(engine, ds); m.set(def.key, rows); }
  return rows;
}
