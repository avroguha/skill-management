// Requests for a new skill or a new category. The catalogue is the same for everyone, so
// nobody but an administrator adds to it directly: a manager (or anyone) asks, and a
// coordinator or an administrator approves it, sends it back with a note to change it, or
// says no with a reason. The asker always sees where it is and with whom.
//
// The rules, on the database (test/requests.test.ts). The server actions around them check
// who is asking (src/app/actions/requests.ts).
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { sameName } from "./similar.ts";

export type RequestKind = "skill" | "category";
export type RequestStatus = "pending" | "returned" | "approved" | "rejected" | "withdrawn";
export const OPEN: RequestStatus[] = ["pending", "returned"];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Waiting for a coordinator",
  returned: "Sent back to change",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

export interface Who { id: string | null; employeeId: string | null; name: string }
export interface Ask {
  kind: RequestKind;
  name: string;
  description?: string;
  /** a skill: the category it should go in ... */
  categoryId?: string | null;
  /** ... or a category that does not exist yet, asked for with it */
  categoryName?: string;
  /** a sub-skill: the skill it goes under */
  parentId?: string | null;
  reason?: string;
}
export type Outcome = { ok: true; id: string; message: string } | { ok: false; error: string };

const clean = (x: string | null | undefined, max: number) => (x ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const step = (by: string, action: string, note = "") => ({ at: new Date().toISOString(), by, action, note });

/** What stands in the way of a name: an existing skill or category, or someone already asking for it. */
async function taken(db: DB, a: { kind: RequestKind; name: string; parentId?: string | null }, exceptId?: string): Promise<string | null> {
  if (a.kind === "category") {
    const cats = await db.select({ name: s.skillCategory.name }).from(s.skillCategory);
    const hit = cats.find((c) => sameName(c.name, a.name));
    if (hit) return `There is already a category called “${hit.name}”.`;
  } else {
    const skills = await db.select({ name: s.skill.name, aliases: s.skill.aliases, parentId: s.skill.parentId }).from(s.skill).where(ne(s.skill.status, "retired"));
    const hit = skills.find((k) => (k.parentId ?? null) === (a.parentId ?? null) && (sameName(k.name, a.name) || k.aliases.some((x) => sameName(x, a.name))));
    if (hit) return `“${hit.name}” is already in the catalogue${sameName(hit.name, a.name) ? "" : ` (it also goes by “${a.name}”)`}: search for it and use it.`;
  }
  const open = await db.select().from(s.catalogueRequest).where(and(eq(s.catalogueRequest.kind, a.kind), inArray(s.catalogueRequest.status, OPEN)));
  const same = open.find((r) => r.id !== exceptId && sameName(r.name, a.name) && (a.kind === "category" || (r.parentId ?? null) === (a.parentId ?? null)));
  return same ? `${same.requestedByName || "Someone"} has already asked for “${same.name}”. It is ${STATUS_LABEL[same.status as RequestStatus].toLowerCase()}.` : null;
}

async function checkPlace(db: DB, a: Ask): Promise<{ error: string } | { categoryId: string | null; categoryName: string; parentId: string | null }> {
  if (a.kind === "category") return { categoryId: null, categoryName: "", parentId: null };
  let categoryId = a.categoryId || null;
  let categoryName = clean(a.categoryName, 80);
  const parentId = a.parentId || null;
  if (parentId) {
    const [p] = await db.select().from(s.skill).where(eq(s.skill.id, parentId));
    if (!p || p.status === "retired") return { error: "The skill it should go under does not exist any more." };
    if (p.parentId) return { error: "Sub-skills go one level deep: choose a top-level skill to put it under." };
    categoryId = p.categoryId;
    categoryName = "";
  }
  if (categoryId) {
    const [c] = await db.select({ id: s.skillCategory.id }).from(s.skillCategory).where(eq(s.skillCategory.id, categoryId));
    if (!c) return { error: "That category does not exist any more. Choose another." };
    categoryName = "";
  } else if (categoryName.length < 2) return { error: "Choose the category it belongs in, or name a new one." };
  else {
    const cats = await db.select().from(s.skillCategory);
    const hit = cats.find((c) => sameName(c.name, categoryName));
    if (hit) { categoryId = hit.id; categoryName = ""; }
  }
  return { categoryId, categoryName, parentId };
}

/** Someone asks for a new skill or category. */
export async function askFor(db: DB, by: Who, input: Ask): Promise<Outcome> {
  const name = clean(input.name, 120);
  if (name.length < 2) return { ok: false, error: input.kind === "category" ? "Name the category." : "Name the skill." };
  if (input.kind === "category" && name.length > 80) return { ok: false, error: "A category name has at most 80 characters." };
  const place = await checkPlace(db, input);
  if ("error" in place) return { ok: false, error: place.error };
  const no = await taken(db, { kind: input.kind, name, parentId: place.parentId });
  if (no) return { ok: false, error: no };
  const [row] = await db.insert(s.catalogueRequest).values({
    kind: input.kind, name, description: clean(input.description, 500), reason: clean(input.reason, 500), ...place,
    status: "pending", requestedById: by.id, requestedByEmployeeId: by.employeeId, requestedByName: by.name, history: [step(by.name, "asked")],
  }).returning({ id: s.catalogueRequest.id });
  return { ok: true, id: row!.id, message: `Asked for “${name}”. A coordinator will look at it; you can follow it under Requests.` };
}

/** The asker changes a request that came back and sends it again (or changes one still waiting). */
export async function resend(db: DB, by: Who, id: string, input: Omit<Ask, "kind">): Promise<Outcome> {
  const [r] = await db.select().from(s.catalogueRequest).where(eq(s.catalogueRequest.id, id));
  if (!r) return { ok: false, error: "That request is no longer there." };
  if (r.requestedById !== by.id) return { ok: false, error: "Only the person who asked can change a request." };
  if (!OPEN.includes(r.status as RequestStatus)) return { ok: false, error: `It is ${STATUS_LABEL[r.status as RequestStatus].toLowerCase()}: it cannot be changed any more. Ask again if you still need it.` };
  const kind = r.kind as RequestKind;
  const name = clean(input.name, 120);
  if (name.length < 2) return { ok: false, error: "Give it a name." };
  const place = await checkPlace(db, { ...input, kind });
  if ("error" in place) return { ok: false, error: place.error };
  const no = await taken(db, { kind, name, parentId: place.parentId }, id);
  if (no) return { ok: false, error: no };
  await db.update(s.catalogueRequest).set({
    name, description: clean(input.description, 500), reason: clean(input.reason, 500), ...place,
    status: "pending", updatedAt: new Date(), history: [...r.history, step(by.name, r.status === "returned" ? "changed it and sent it again" : "changed it")],
  }).where(eq(s.catalogueRequest.id, id));
  return { ok: true, id, message: "Sent again. A coordinator will look at it." };
}

export async function withdraw(db: DB, by: Who, id: string): Promise<Outcome> {
  const [r] = await db.select().from(s.catalogueRequest).where(eq(s.catalogueRequest.id, id));
  if (!r) return { ok: false, error: "That request is no longer there." };
  if (r.requestedById !== by.id) return { ok: false, error: "Only the person who asked can withdraw a request." };
  if (!OPEN.includes(r.status as RequestStatus)) return { ok: false, error: "It has been decided already." };
  await db.update(s.catalogueRequest).set({ status: "withdrawn", updatedAt: new Date(), history: [...r.history, step(by.name, "withdrew it")] }).where(eq(s.catalogueRequest.id, id));
  return { ok: true, id, message: "Withdrawn." };
}

export interface Decision {
  id: string;
  decision: "approve" | "return" | "reject";
  /** needed to send it back or to say no; optional with an approval */
  comment?: string;
  /** an approval may change what was asked for */
  name?: string;
  description?: string;
  categoryId?: string | null;
  categoryName?: string;
  parentId?: string | null;
}

/** A coordinator (or an administrator) decides. Approving makes the skill or the category. */
export async function decide(db: DB, by: Who, d: Decision): Promise<Outcome> {
  const [r] = await db.select().from(s.catalogueRequest).where(eq(s.catalogueRequest.id, d.id));
  if (!r) return { ok: false, error: "That request is no longer there." };
  if (r.status !== "pending") return { ok: false, error: `It is not waiting any more (${STATUS_LABEL[r.status as RequestStatus].toLowerCase()}).` };
  const comment = clean(d.comment, 1000);
  const now = new Date();
  const decided = { decidedById: by.id, decidedByName: by.name, decidedAt: now, updatedAt: now, comment };
  if (d.decision !== "approve") {
    if (comment.length < 3) return { ok: false, error: d.decision === "return" ? "Say what should change, so they can send it again." : "Say why not, so they know." };
    const status: RequestStatus = d.decision === "return" ? "returned" : "rejected";
    await db.update(s.catalogueRequest).set({ ...decided, status, history: [...r.history, step(by.name, status === "returned" ? "sent back" : "said no", comment)] }).where(eq(s.catalogueRequest.id, r.id));
    return { ok: true, id: r.id, message: status === "returned" ? `Sent back to ${r.requestedByName || "the asker"} with your note.` : "Not approved. They see your reason." };
  }

  const kind = r.kind as RequestKind;
  const name = clean(d.name ?? r.name, 120);
  const description = clean(d.description ?? r.description, 500);
  if (name.length < 2) return { ok: false, error: "Give it a name." };
  const place = await checkPlace(db, { kind, name, categoryId: d.categoryId === undefined ? r.categoryId : d.categoryId, categoryName: d.categoryName ?? r.categoryName, parentId: d.parentId === undefined ? r.parentId : d.parentId });
  if ("error" in place) return { ok: false, error: place.error };
  const no = await taken(db, { kind, name, parentId: place.parentId }, r.id);
  if (no) return { ok: false, error: no };
  const changed = [name !== r.name ? `name: “${r.name}” → “${name}”` : "", kind === "skill" && (place.categoryId ?? place.categoryName) !== (r.categoryId ?? r.categoryName) ? "category changed" : ""].filter(Boolean).join("; ");
  let resultId = "";
  let finalCategoryId = place.categoryId;
  await db.transaction(async (tx) => {
    const sortOf = async () => (await tx.select({ sort: s.skillCategory.sort }).from(s.skillCategory)).reduce((m, c) => Math.max(m, c.sort), 0) + 1;
    if (kind === "category") {
      const [c] = await tx.insert(s.skillCategory).values({ name, description, sort: await sortOf() }).returning({ id: s.skillCategory.id });
      resultId = c!.id;
    } else {
      let categoryId = place.categoryId;
      if (!categoryId) {
        const [c] = await tx.insert(s.skillCategory).values({ name: place.categoryName, description: "", sort: await sortOf() }).returning({ id: s.skillCategory.id });
        categoryId = c!.id;
        finalCategoryId = categoryId;
      }
      const [k] = await tx.insert(s.skill).values({ name, description, categoryId, parentId: place.parentId, status: "active" }).returning({ id: s.skill.id });
      resultId = k!.id;
    }
    await tx.update(s.catalogueRequest).set({
      ...decided, status: "approved", name, description, categoryId: kind === "skill" ? finalCategoryId : null, categoryName: "", resultId,
      comment: comment || (changed ? `Approved with a change (${changed}).` : ""),
      history: [...r.history, step(by.name, changed ? "approved with a change" : "approved", comment || changed)],
    }).where(eq(s.catalogueRequest.id, r.id));
  });
  return { ok: true, id: resultId, message: kind === "category" ? `Category “${name}” added to the catalogue.` : `“${name}” added to the catalogue. Everyone can use it now.` };
}
