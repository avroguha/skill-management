// Directory sync: the people under a top-level user, recursively, from ServiceNow
// sys_user into the employee table - and, optionally, the organisation tree built
// from the manager chain.
//
//  fetchDirectory  walks down from rootUserName level by level (manager IN <ids>),
//                  keeps the records whose type field is one of typeValues (the root
//                  always), and re-attaches everyone to their nearest kept manager.
//                  Excluded records (service accounts) are still walked through.
//  applyDirectory  one transaction: match by directory id, then e-mail, then login
//                  name; update; deactivate directory people who are gone (never
//                  delete: their ratings are history); rebuild the sync-owned units.
import { eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DB } from "../../db/index.ts";
import * as s from "../../db/schema.ts";
import { matchRoleRule, type DirectoryConfig } from "./config.ts";
import { assertFieldName, assertQueryValue, SnError, type ServiceNow, type SnRecord } from "./servicenow.ts";

export interface DirPerson {
  externalId: string;
  userName: string;
  name: string;
  email: string;
  title: string;
  userType: string;
  /** the nearest included manager (excluded managers are skipped over) */
  managerExternalId: string | null;
  depth: number;
  attributes: Record<string, string>;
}

export interface FetchResult {
  root: DirPerson;
  people: DirPerson[];
  excluded: { userName: string; name: string; userType: string }[];
  /** how many fetched records had each type value */
  byType: Record<string, number>;
  truncated: boolean;
}

const MAX_DEPTH = 30;

export function fieldList(c: DirectoryConfig): string[] {
  const f = c.fields;
  return [...new Set(["sys_id", f.userName, f.name, f.email, f.manager, f.title, c.typeField, ...c.extraFields].filter(Boolean))].map(assertFieldName);
}

export async function fetchDirectory(sn: ServiceNow, c: DirectoryConfig, opts: { maxPeople?: number } = {}): Promise<FetchResult> {
  const f = c.fields;
  const fields = fieldList(c);
  const max = opts.maxPeople ?? c.maxPeople;
  const extra = c.extraQuery.trim();
  if (!c.rootUserName.trim()) throw new SnError("Set the top-level user name first.");
  const rootRows = await sn.all(c.table, `${f.userName}=${assertQueryValue(c.rootUserName.trim(), "The top-level user name")}`, fields, 2);
  if (!rootRows.length) throw new SnError(`No record in ${c.table} has ${f.userName} = "${c.rootUserName}".`);
  if (rootRows.length > 1) throw new SnError(`More than one record has ${f.userName} = "${c.rootUserName}".`);

  const raw = new Map<string, { row: SnRecord; depth: number; parent: string | null }>();
  raw.set(rootRows[0].sys_id, { row: rootRows[0], depth: 0, parent: null });
  let level = [rootRows[0].sys_id];
  let truncated = false;
  for (let depth = 1; level.length && depth <= MAX_DEPTH; depth++) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 100) {
      const ids = level.slice(i, i + 100);
      const q = `${f.manager}IN${ids.join(",")}${extra ? `^${extra}` : ""}`;
      for (const row of await sn.all(c.table, q, fields, max)) {
        if (raw.has(row.sys_id)) continue; // a cycle in the manager chain
        if (raw.size >= max) { truncated = true; break; }
        raw.set(row.sys_id, { row, depth, parent: row[f.manager] || null });
        next.push(row.sys_id);
      }
      if (truncated) break;
    }
    if (truncated) break;
    level = next;
  }

  const allowed = new Set(c.typeValues.map((v) => v.trim()).filter(Boolean));
  const isIncluded = (id: string) => {
    if (id === rootRows[0].sys_id) return true;
    const t = raw.get(id)?.row[c.typeField] ?? "";
    return allowed.size === 0 || allowed.has(t);
  };
  const byType: Record<string, number> = {};
  for (const { row } of raw.values()) {
    const t = row[c.typeField] ?? "";
    byType[t || "(empty)"] = (byType[t || "(empty)"] ?? 0) + 1;
  }
  const nearestIncluded = (id: string | null): string | null => {
    const seen = new Set<string>();
    let cur = id;
    while (cur && raw.has(cur) && !seen.has(cur)) {
      if (isIncluded(cur)) return cur;
      seen.add(cur);
      cur = raw.get(cur)!.parent;
    }
    return null;
  };

  const people: DirPerson[] = [];
  const excluded: FetchResult["excluded"] = [];
  for (const [id, { row, depth, parent }] of raw) {
    const userName = (row[f.userName] ?? "").trim();
    const name = (row[f.name] ?? "").trim() || userName;
    if (!isIncluded(id)) {
      excluded.push({ userName, name, userType: row[c.typeField] ?? "" });
      continue;
    }
    const attributes: Record<string, string> = {};
    for (const k of fields) if (row[k] != null) attributes[k] = String(row[k]);
    people.push({
      externalId: id,
      userName,
      name,
      email: (row[f.email] ?? "").trim().toLowerCase(),
      title: (row[f.title] ?? "").trim(),
      userType: row[c.typeField] ?? "",
      managerExternalId: id === rootRows[0].sys_id ? null : nearestIncluded(parent),
      depth,
      attributes,
    });
  }
  const root = people.find((p) => p.externalId === rootRows[0].sys_id)!;
  return { root, people, excluded, byType, truncated };
}

export interface ApplyResult { created: number; updated: number; deactivated: number; skipped: number; messages: string[]; units: number; rolesSet: number }

const KIND_BY_DEPTH = ["company", "division", "department"];

export async function applyDirectory(db: DB, r: FetchResult, c: DirectoryConfig): Promise<ApplyResult> {
  const out: ApplyResult = { created: 0, updated: 0, deactivated: 0, skipped: 0, messages: [], units: 0, rolesSet: 0 };
  const now = new Date();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(s.employee);
    const byExt = new Map(existing.filter((e) => e.externalId).map((e) => [e.externalId!, e]));
    const byEmail = new Map<string, { id: string; name: string }>(existing.map((e) => [e.email.toLowerCase(), { id: e.id, name: e.name }]));
    const byId = new Map(existing.map((e) => [e.id, e]));
    const byLogin = new Map(existing.filter((e) => e.userName && !e.externalId).map((e) => [e.userName!.toLowerCase(), e]));
    const localId = new Map<string, string>();

    for (const p of r.people) {
      const email = p.email || `${p.userName || p.externalId}@directory.invalid`;
      const emailMatch = p.email ? byEmail.get(p.email) : undefined;
      const match = byExt.get(p.externalId)
        ?? (emailMatch ? byId.get(emailMatch.id) : undefined)
        ?? (p.userName ? byLogin.get(p.userName.toLowerCase()) : undefined);
      const clash = byEmail.get(email);
      if (clash && clash.id !== match?.id) {
        out.skipped += 1;
        out.messages.push(`${p.userName}: the e-mail ${email} already belongs to ${clash.name}; skipped`);
        continue;
      }
      const values = {
        name: p.name, email, title: p.title, userName: p.userName || null, userType: p.userType,
        attributes: p.attributes, source: "directory", externalId: p.externalId, active: true, syncedAt: now,
      };
      if (match) {
        await tx.update(s.employee).set(values).where(eq(s.employee.id, match.id));
        localId.set(p.externalId, match.id);
        out.updated += 1;
      } else {
        const [row] = await tx.insert(s.employee).values(values).returning({ id: s.employee.id });
        localId.set(p.externalId, row.id);
        out.created += 1;
      }
      byEmail.set(email, { id: localId.get(p.externalId)!, name: p.name });
    }

    // managers, now that everyone has a local id
    for (const p of r.people) {
      const id = localId.get(p.externalId);
      if (!id) continue;
      const mgr = p.managerExternalId ? localId.get(p.managerExternalId) ?? null : null;
      await tx.update(s.employee).set({ managerId: mgr }).where(eq(s.employee.id, id));
    }

    // roles from designations: fill an empty role, or (when allowed) change one
    if (c.roleRules.length) {
      const roleIds = new Set((await tx.select({ id: s.jobRole.id }).from(s.jobRole)).map((x) => x.id));
      const gradeIds = new Set((await tx.select({ id: s.grade.id }).from(s.grade)).map((x) => x.id));
      let missingRole = false;
      for (const p of r.people) {
        const id = localId.get(p.externalId);
        if (!id) continue;
        const rule = matchRoleRule(c.roleRules, p.title);
        if (!rule) continue;
        if (!roleIds.has(rule.roleId)) { missingRole = true; continue; }
        const before = byId.get(id);
        const hadRole = before?.roleId ?? null;
        if (hadRole && !c.roleRulesOverwrite) continue;
        const gradeId = rule.gradeId && gradeIds.has(rule.gradeId) ? rule.gradeId : undefined;
        if (hadRole === rule.roleId && (gradeId === undefined || before?.gradeId === gradeId)) continue;
        await tx.update(s.employee).set(gradeId === undefined ? { roleId: rule.roleId } : { roleId: rule.roleId, gradeId }).where(eq(s.employee.id, id));
        out.rolesSet += 1;
      }
      if (missingRole) out.messages.push("a designation rule names a role that no longer exists; fix it in Admin › ServiceNow");
    }

    // gone from the directory: deactivated, never deleted
    const seen = new Set(r.people.map((p) => p.externalId));
    const gone = existing.filter((e) => e.source === "directory" && e.active && e.externalId && !seen.has(e.externalId));
    if (gone.length) {
      await tx.update(s.employee).set({ active: false }).where(inArray(s.employee.id, gone.map((e) => e.id)));
      out.deactivated = gone.length;
    }

    if (c.orgFromHierarchy) out.units = await rebuildUnits(tx as unknown as DB, r, localId);
  });
  return out;
}

/** A unit per included manager ("mgr:<id>"), parented by their manager's unit. A manager
 *  sits in the unit they lead; everyone else in their manager's unit. */
async function rebuildUnits(tx: DB, r: FetchResult, localId: Map<string, string>): Promise<number> {
  const reports = new Map<string, number>();
  for (const p of r.people) if (p.managerExternalId) reports.set(p.managerExternalId, (reports.get(p.managerExternalId) ?? 0) + 1);
  const managers = r.people.filter((p) => reports.has(p.externalId) || p.externalId === r.root.externalId);

  const existing = await tx.select().from(s.orgUnit).where(sql`${s.orgUnit.externalKey} is not null`);
  const unitByKey = new Map(existing.map((u) => [u.externalKey!, u.id]));

  // parents first: managers in depth order
  for (const m of [...managers].sort((a, b) => a.depth - b.depth)) {
    const key = `mgr:${m.externalId}`;
    const parentKey = m.managerExternalId ? `mgr:${m.managerExternalId}` : null;
    const values = {
      name: m.name,
      kind: KIND_BY_DEPTH[m.depth] ?? "team",
      parentId: parentKey ? unitByKey.get(parentKey) ?? null : null,
      managerId: localId.get(m.externalId) ?? null,
      sort: 0,
    };
    const id = unitByKey.get(key);
    if (id) await tx.update(s.orgUnit).set(values).where(eq(s.orgUnit.id, id));
    else unitByKey.set(key, (await tx.insert(s.orgUnit).values({ ...values, externalKey: key }).returning({ id: s.orgUnit.id }))[0].id);
  }
  // membership
  for (const p of r.people) {
    const id = localId.get(p.externalId);
    if (!id) continue;
    const own = unitByKey.get(`mgr:${p.externalId}`);
    const mgrUnit = p.managerExternalId ? unitByKey.get(`mgr:${p.managerExternalId}`) : undefined;
    const unitId = (reports.has(p.externalId) || p.externalId === r.root.externalId ? own : mgrUnit) ?? mgrUnit ?? own ?? null;
    await tx.update(s.employee).set({ unitId }).where(eq(s.employee.id, id));
  }
  // sync-owned units nobody leads any more
  const wanted = new Set(managers.map((m) => `mgr:${m.externalId}`));
  const stale = existing.filter((u) => !wanted.has(u.externalKey!)).map((u) => u.id);
  if (stale.length) {
    await tx.update(s.employee).set({ unitId: null }).where(inArray(s.employee.unitId, stale));
    await tx.update(s.orgUnit).set({ parentId: null }).where(inArray(s.orgUnit.parentId, stale));
    await tx.delete(s.orgUnit).where(inArray(s.orgUnit.id, stale));
  }

  // A hand-made top-level unit that holds nothing (no people, no units below, no team
  // needs) is a leftover - for example the placeholder "Remove the organisation" leaves -
  // and would show as a second top next to the tree built here. Units with anything in
  // them are never touched.
  const empty = await tx.select({ id: s.orgUnit.id }).from(s.orgUnit).where(sql`${s.orgUnit.externalKey} is null
    and ${s.orgUnit.parentId} is null
    and not exists (select 1 from ${s.employee} e where e.unit_id = ${s.orgUnit.id})
    and not exists (select 1 from ${s.orgUnit} c where c.parent_id = ${s.orgUnit.id})
    and not exists (select 1 from ${s.unitRequirement} r where r.unit_id = ${s.orgUnit.id})`);
  if (empty.length) {
    const ids = empty.map((u) => u.id);
    await tx.delete(s.snapshot).where(inArray(s.snapshot.unitId, ids));
    await tx.delete(s.orgUnit).where(inArray(s.orgUnit.id, ids));
  }

  return managers.length;
}

// ---- groups (sys_user_group, sys_user_grmember) ---------------------------------------------

export interface DirGroup {
  externalId: string;
  name: string;
  description: string;
  email: string;
  managerExternalId: string | null;
  active: boolean;
  /** sys_ids of the synced people in it */
  members: string[];
}

const CHUNK = 100;

/** The groups the synced people belong to (memberships first, then the groups that match groupQuery). */
export async function fetchGroups(sn: ServiceNow, c: DirectoryConfig, userIds: string[]): Promise<DirGroup[]> {
  const memberOf = new Map<string, Set<string>>();
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const ids = userIds.slice(i, i + CHUNK).map((id) => assertQueryValue(id, "A user sys_id"));
    for (const r of await sn.all("sys_user_grmember", `userIN${ids.join(",")}`, ["sys_id", "group", "user"], 200000)) {
      if (!r.group || !r.user) continue;
      const set = memberOf.get(r.group) ?? new Set<string>();
      set.add(r.user);
      memberOf.set(r.group, set);
    }
  }
  const groupIds = [...memberOf.keys()];
  const extra = c.groupQuery.trim();
  const out: DirGroup[] = [];
  for (let i = 0; i < groupIds.length; i += CHUNK) {
    const ids = groupIds.slice(i, i + CHUNK).map((id) => assertQueryValue(id, "A group sys_id"));
    const q = `sys_idIN${ids.join(",")}${extra ? `^${extra}` : ""}`;
    for (const g of await sn.all("sys_user_group", q, ["sys_id", "name", "description", "email", "manager", "active"])) {
      out.push({
        externalId: g.sys_id, name: g.name || g.sys_id, description: g.description ?? "", email: g.email ?? "",
        managerExternalId: g.manager || null, active: g.active !== "false", members: [...(memberOf.get(g.sys_id) ?? [])],
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Replaces the imported groups and their memberships with what was fetched, in one transaction. */
export async function applyGroups(db: DB, groups: DirGroup[]): Promise<{ groups: number; memberships: number; removed: number }> {
  return db.transaction(async (tx) => {
    const people = await tx.select({ id: s.employee.id, ext: s.employee.externalId }).from(s.employee).where(sql`${s.employee.externalId} is not null`);
    const local = new Map(people.map((p) => [p.ext!, p.id]));
    const now = new Date();
    let memberships = 0;
    for (const g of groups) {
      const [row] = await tx.insert(s.snGroup).values({
        externalId: g.externalId, name: g.name, description: g.description, email: g.email,
        managerExternalId: g.managerExternalId, active: g.active, syncedAt: now,
      }).onConflictDoUpdate({
        target: s.snGroup.externalId,
        set: { name: g.name, description: g.description, email: g.email, managerExternalId: g.managerExternalId, active: g.active, syncedAt: now },
      }).returning({ id: s.snGroup.id });
      await tx.delete(s.groupMember).where(eq(s.groupMember.groupId, row.id));
      const members = [...new Set(g.members.map((m) => local.get(m)).filter((x): x is string => !!x))];
      if (members.length) await tx.insert(s.groupMember).values(members.map((employeeId) => ({ groupId: row.id, employeeId })));
      memberships += members.length;
    }
    // groups nobody synced belongs to any more (or that no longer match the query) go
    const keep = groups.map((g) => g.externalId);
    const gone = await tx.delete(s.snGroup).where(keep.length ? notInArray(s.snGroup.externalId, keep) : sql`true`).returning({ id: s.snGroup.id });
    return { groups: groups.length, memberships, removed: gone.length };
  });
}

/** The whole job: fetch, apply, record the run. Never throws; the run row says what happened. */
export async function runSync(db: DB, sn: ServiceNow, c: DirectoryConfig, trigger: "manual" | "schedule", actorName = "") {
  const [run] = await db.insert(s.syncRun).values({ trigger, actorName }).returning();
  try {
    const fetched = await fetchDirectory(sn, c);
    const applied = await applyDirectory(db, fetched, c);
    // groups: a failure here is reported, but does not undo the people
    let groupNote = "";
    if (c.importGroups) {
      try {
        const g = await applyGroups(db, await fetchGroups(sn, c, fetched.people.map((p) => p.externalId)));
        groupNote = `${g.groups} group${g.groups === 1 ? "" : "s"} with ${g.memberships} membership${g.memberships === 1 ? "" : "s"}${g.removed ? `, ${g.removed} removed` : ""}`;
      } catch (e) {
        groupNote = `groups not imported: ${(e as Error).message}`;
      }
    }
    const message = [
      `${fetched.people.length} people under ${fetched.root.name} (${fetched.excluded.length} left out by the type filter)`,
      fetched.truncated ? `stopped at the limit of ${c.maxPeople}` : "",
      applied.rolesSet ? `${applied.rolesSet} role${applied.rolesSet === 1 ? "" : "s"} set from designations` : "",
      groupNote,
      ...applied.messages.slice(0, 20),
    ].filter(Boolean).join("; ");
    const [done] = await db.update(s.syncRun).set({
      status: "ok", finishedAt: new Date(), fetched: fetched.people.length, created: applied.created,
      updated: applied.updated, deactivated: applied.deactivated, skipped: applied.skipped, message,
    }).where(eq(s.syncRun.id, run.id)).returning();
    return done;
  } catch (e) {
    const [done] = await db.update(s.syncRun).set({ status: "failed", finishedAt: new Date(), message: (e as Error).message })
      .where(eq(s.syncRun.id, run.id)).returning();
    return done;
  }
}
