// Directory sync against a stand-in ServiceNow Table API (the same requests and
// answers as a real instance; the live run against a PDI is test/servicenow.live.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.BETTER_AUTH_SECRET = "test-secret-for-the-directory-tests";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { createServiceNow } = await import("../src/lib/directory/servicenow.ts");
const { fetchDirectory, applyDirectory, runSync } = await import("../src/lib/directory/sync.ts");
const { DEFAULT_DIRECTORY, photoUrl, sealPassword, directoryPassword, readDirectoryConfig } = await import("../src/lib/directory/config.ts");
const { open } = await import("../src/lib/secret-box.ts");

type Row = Record<string, string>;
// boss -> ana (manager) -> bea, ben
//      -> svc (service account) -> xia      (xia must re-attach to boss)
//      -> old (inactive)
let USERS: Row[] = [];
function reset() {
  USERS = [
    { sys_id: "1", user_name: "boss", name: "Bo Boss", email: "bo@acme.test", title: "CEO", manager: "", identity_type: "human", active: "true", employee_number: "E1" },
    { sys_id: "2", user_name: "ana", name: "Ana Lead", email: "ana@acme.test", title: "Engineering Manager", manager: "1", identity_type: "human", active: "true", employee_number: "E2" },
    { sys_id: "3", user_name: "bea", name: "Bea Dev", email: "BEA@acme.test", title: "Engineer", manager: "2", identity_type: "human", active: "true", employee_number: "E3" },
    { sys_id: "4", user_name: "ben", name: "Ben Dev", email: "ben@acme.test", title: "Engineer", manager: "2", identity_type: "human", active: "true", employee_number: "E4" },
    { sys_id: "5", user_name: "svc.int", name: "Integration", email: "", title: "", manager: "1", identity_type: "machine", active: "true", employee_number: "" },
    { sys_id: "6", user_name: "xia", name: "Xia Ops", email: "xia@acme.test", title: "Operator", manager: "5", identity_type: "human", active: "true", employee_number: "E6" },
    { sys_id: "7", user_name: "old", name: "Old Timer", email: "old@acme.test", title: "Retired", manager: "1", identity_type: "human", active: "false", employee_number: "E7" },
  ];
}
// groups: ana and bea in "Platform" (active), ben in "Old team" (inactive), svc.int in "Integrations"
let GROUPS: Row[] = [];
let MEMBERS: Row[] = [];
function resetGroups() {
  GROUPS = [
    { sys_id: "g1", name: "Platform", description: "Platform engineering", email: "platform@acme.test", manager: "2", active: "true" },
    { sys_id: "g2", name: "Old team", description: "", email: "", manager: "", active: "false" },
    { sys_id: "g3", name: "Integrations", description: "", email: "", manager: "", active: "true" },
  ];
  MEMBERS = [
    { sys_id: "m1", group: "g1", user: "2" }, { sys_id: "m2", group: "g1", user: "3" },
    { sys_id: "m3", group: "g2", user: "4" }, { sys_id: "m4", group: "g3", user: "5" },
  ];
}
reset();
resetGroups();

const calls: string[] = [];
function matches(row: Row, q: string): boolean {
  return q.split("^").filter((c) => c && !c.startsWith("ORDERBY")).every((c) => {
    const inM = /^(\w+)IN(.*)$/.exec(c);
    if (inM) return inM[2].split(",").includes(row[inM[1]] ?? "");
    const eqM = /^(\w+)=(.*)$/.exec(c);
    if (eqM) return (row[eqM[1]] ?? "") === eqM[2];
    throw new Error(`stand-in cannot read condition ${c}`);
  });
}
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  calls.push(url.pathname + url.search);
  if ((init?.headers as Record<string, string>).authorization !== "Basic " + Buffer.from("svc.reader:pw-123").toString("base64")) {
    return new Response(JSON.stringify({ error: { message: "User Not Authenticated" } }), { status: 401 });
  }
  const q = url.searchParams.get("sysparm_query") ?? "";
  if (url.pathname.startsWith("/api/now/stats/")) {
    const field = url.searchParams.get("sysparm_group_by")!;
    const counts = new Map<string, number>();
    for (const r of USERS.filter((r) => matches(r, q))) counts.set(r[field] ?? "", (counts.get(r[field] ?? "") ?? 0) + 1);
    return Response.json({ result: [...counts].map(([value, n]) => ({ stats: { count: String(n) }, groupby_fields: [{ field, value }] })) });
  }
  const fields = (url.searchParams.get("sysparm_fields") ?? "").split(",");
  const limit = Number(url.searchParams.get("sysparm_limit")), offset = Number(url.searchParams.get("sysparm_offset"));
  const table = url.pathname.split("/").pop();
  const source = table === "sys_user_group" ? GROUPS : table === "sys_user_grmember" ? MEMBERS : USERS;
  const rows = source.filter((r) => matches(r, q)).sort((a, b) => a.sys_id.localeCompare(b.sys_id));
  const page = rows.slice(offset, offset + limit).map((r) => Object.fromEntries(fields.map((f) => [f, r[f] ?? ""])));
  return Response.json({ result: page }, { headers: { "x-total-count": String(rows.length) } });
}) as typeof fetch;

const sn = createServiceNow({ instanceUrl: "https://acme.service-now.test", username: "svc.reader", password: "pw-123", fetchImpl: fakeFetch });
const config = { ...DEFAULT_DIRECTORY, enabled: true, rootUserName: "boss", extraFields: ["employee_number"] };

test.after(() => closeDb());

test("walks down from the top user, keeps humans, re-attaches people reporting to a service account", async () => {
  const r = await fetchDirectory(sn, config);
  assert.deepEqual(r.people.map((p) => p.userName).sort(), ["ana", "bea", "ben", "boss", "xia"]);
  assert.deepEqual(r.excluded.map((p) => p.userName), ["svc.int"]);
  assert.equal(r.people.find((p) => p.userName === "xia")!.managerExternalId, "1", "xia's manager is a service account: nearest kept manager is boss");
  assert.equal(r.people.find((p) => p.userName === "bea")!.email, "bea@acme.test", "e-mail lower-cased");
  assert.equal(r.people.find((p) => p.userName === "bea")!.attributes.employee_number, "E3");
  assert.ok(!r.people.some((p) => p.userName === "old"), "the extra query (active=true) leaves out inactive records");
  assert.ok(calls.some((c) => decodeURIComponent(c).includes("managerIN1^active=true")), "one query per level, not per person");
  const everyone = await fetchDirectory(sn, { ...config, typeValues: [] });
  assert.equal(everyone.people.length, 6);
});

test("errors say what went wrong", async () => {
  const bad = createServiceNow({ instanceUrl: "https://acme.service-now.test", username: "svc.reader", password: "nope", fetchImpl: fakeFetch });
  await assert.rejects(fetchDirectory(bad, config), /refused the user "svc.reader" \(401\)/);
  await assert.rejects(fetchDirectory(sn, { ...config, rootUserName: "nobody" }), /No record in sys_user has user_name = "nobody"/);
  await assert.rejects(fetchDirectory(sn, { ...config, rootUserName: "a^b" }), /may not contain/);
  assert.throws(() => createServiceNow({ instanceUrl: "acme", username: "", password: "" }), /instance URL must look like/);
  assert.deepEqual(await sn.distinct("sys_user", "identity_type", "active=true"), [{ value: "human", count: 5 }, { value: "machine", count: 1 }]);
});

test("apply: creates, adopts an existing record by e-mail, and sets managers (the reporting lines are the teams)", async () => {
  const db = await getDb();
  await db.insert(s.employee).values({ name: "Bea (typed by hand)", email: "bea@acme.test", title: "" });
  const r = await fetchDirectory(sn, config);
  const a = await applyDirectory(db, r, config);
  assert.deepEqual([a.created, a.updated, a.deactivated, a.skipped], [4, 1, 0, 0]);
  const people = await db.select().from(s.employee);
  const by = (u: string) => people.find((p) => p.userName === u)!;
  assert.equal(by("bea").name, "Bea Dev", "the hand-made record was adopted and updated");
  assert.equal(by("bea").source, "directory");
  assert.equal(by("bea").managerId, by("ana").id);
  assert.equal(by("xia").managerId, by("boss").id);
  assert.equal(by("ana").title, "Engineering Manager", "designation from the title field");
});

test("a second run updates and deactivates people who left (never deletes)", async () => {
  const db = await getDb();
  USERS = USERS.filter((u) => u.user_name !== "ben" && u.user_name !== "bea");
  USERS.find((u) => u.user_name === "ana")!.title = "Director";
  const run = await runSync(db, sn, config, "manual", "tester");
  assert.equal(run.status, "ok", run.message);
  assert.deepEqual([run.created, run.updated, run.deactivated], [0, 3, 2]);
  const people = await db.select().from(s.employee);
  assert.equal(people.find((p) => p.userName === "ben")!.active, false);
  assert.equal(people.find((p) => p.userName === "ana")!.title, "Director");
  reset();
});

test("the sync gives nobody a role: roles are each team's own, and settings that still hold designation rules lose them", async () => {
  const db = await getDb();
  await db.insert(s.appSetting).values({ key: "directory", value: { ...config, roleRules: [{ op: "is", text: "CEO", roleId: "gone", gradeId: "" }], roleRulesOverwrite: true } as never })
    .onConflictDoUpdate({ target: s.appSetting.key, set: { value: { ...config, roleRules: [{ op: "is", text: "CEO", roleId: "gone", gradeId: "" }], roleRulesOverwrite: true } as never } });
  const read = await readDirectoryConfig(db);
  assert.ok(!("roleRules" in read) && !("roleRulesOverwrite" in read), "old designation rules are dropped when the settings are read");
  const run = await runSync(db, sn, read, "manual", "tester");
  assert.equal(run.status, "ok", run.message);
  assert.doesNotMatch(run.message ?? "", /role/i);
  assert.equal((await db.select().from(s.teamRoleMember)).length, 0, "nobody is put in a role by the sync");
  await db.delete(s.appSetting).where(eq(s.appSetting.key, "directory"));
  reset();
});

test("a failed run is recorded with its reason, and changes nothing", async () => {
  const db = await getDb();
  const before = (await db.select().from(s.employee)).length;
  const run = await runSync(db, sn, { ...config, rootUserName: "nobody" }, "schedule");
  assert.equal(run.status, "failed");
  assert.match(run.message, /No record/);
  assert.equal((await db.select().from(s.employee)).length, before);
  const runs = await db.select().from(s.syncRun).where(eq(s.syncRun.trigger, "schedule"));
  assert.equal(runs.length, 1);
});

test("the password is stored sealed and opens again; the photo URL fills placeholders", () => {
  const sealed = sealPassword("pw-123");
  assert.ok(!sealed.includes("pw-123"));
  assert.equal(open(sealed), "pw-123");
  assert.equal(directoryPassword({ ...config, passwordSealed: sealed }), "pw-123");
  const person = { email: "bea@acme.test", userName: "bea", externalId: "3", attributes: { employee_number: "E3" } };
  assert.equal(photoUrl("https://photos.acme.test/{user_name}.jpg", person), "https://photos.acme.test/bea.jpg");
  assert.equal(photoUrl("https://p.test/{employee_number}?e={email}", person), "https://p.test/E3?e=bea%40acme.test");
  assert.equal(photoUrl("https://p.test/{missing}", person), null);
  assert.equal(photoUrl("", person), null);
});

test("groups: the synced people's groups come in with their members; a group nobody is in any more goes", async () => {
  const db = await getDb();
  resetGroups();
  const config = { ...DEFAULT_DIRECTORY, rootUserName: "boss", instanceUrl: "https://acme.service-now.test", username: "svc.reader" };
  const run = await runSync(db, sn, config, "manual", "tester");
  assert.equal(run.status, "ok", run.message);
  assert.match(run.message, /1 group with 2 memberships/, "only active groups (the default query), only synced members");
  const groups = await db.select().from(s.snGroup);
  assert.deepEqual(groups.map((g) => g.name), ["Platform"], "the inactive group and the service account's group are not brought in");
  const members = await db.select({ name: s.employee.name }).from(s.groupMember)
    .innerJoin(s.employee, eq(s.employee.id, s.groupMember.employeeId));
  assert.deepEqual(members.map((m) => m.name).sort(), ["Ana Lead", "Bea Dev"]);

  // every group, whatever its state
  const all = await runSync(db, sn, { ...config, groupQuery: "" }, "manual", "tester");
  assert.match(all.message, /2 groups with 3 memberships/);
  // bea leaves Platform, the Old team is emptied: it goes, Platform keeps ana
  MEMBERS = MEMBERS.filter((m) => m.sys_id !== "m2" && m.group !== "g2");
  const again = await runSync(db, sn, { ...config, groupQuery: "" }, "manual", "tester");
  assert.match(again.message, /1 group with 1 membership, 1 removed/);
  assert.deepEqual((await db.select().from(s.snGroup)).map((g) => g.name), ["Platform"]);

  // turned off: groups are left as they are
  const off = await runSync(db, sn, { ...config, importGroups: false }, "manual", "tester");
  assert.doesNotMatch(off.message, /group/);
  assert.equal((await db.select().from(s.snGroup)).length, 1);
  resetGroups();
});
