// Live check against a real ServiceNow instance. Skipped unless these are set:
//   SN_LIVE_INSTANCE=https://<instance>.service-now.com SN_LIVE_USER=... SN_LIVE_PASS=... SN_LIVE_ROOT=<user_name>
// Expects the test hierarchy described in docs/servicenow-test-users.md (root skm.cto).
import test from "node:test";
import assert from "node:assert/strict";

const { SN_LIVE_INSTANCE: instanceUrl, SN_LIVE_USER: username, SN_LIVE_PASS: password, SN_LIVE_ROOT: root = "skm.cto" } = process.env;

test("live: the directory walk returns the test hierarchy, filtered by identity_type", { skip: !instanceUrl && "SN_LIVE_INSTANCE not set" }, async () => {
  process.env.BETTER_AUTH_SECRET ??= "live-test";
  const { createServiceNow } = await import("../src/lib/directory/servicenow.ts");
  const { fetchDirectory } = await import("../src/lib/directory/sync.ts");
  const { DEFAULT_DIRECTORY } = await import("../src/lib/directory/config.ts");
  const sn = createServiceNow({ instanceUrl: instanceUrl!, username: username!, password: password! });
  const humans = await fetchDirectory(sn, { ...DEFAULT_DIRECTORY, rootUserName: root, typeValues: ["human"] });
  assert.equal(humans.people.length, 14);
  assert.deepEqual(humans.excluded.map((x) => x.userType).sort(), ["machine", "machine", "unclassified", "unclassified"]);
  const byName = new Map(humans.people.map((p) => [p.userName, p]));
  assert.equal(byName.get("skm.eng.mia")!.managerExternalId, byName.get("skm.mgr.cloud")!.externalId);
  assert.equal(byName.get("skm.mgr.cloud")!.depth, 2);
  const all = await fetchDirectory(sn, { ...DEFAULT_DIRECTORY, rootUserName: root, typeValues: [] });
  assert.equal(all.people.length, 18);
});
