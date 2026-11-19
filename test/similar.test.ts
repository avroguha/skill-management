// The name search behind every "add a role / add a skill" box: what exists is found while its
// name is typed, whatever the order of the words, and exactly the same name counts as taken.
import test from "node:test";
import assert from "node:assert/strict";
import { findNames, matchScore, normName, sameName } from "../src/lib/similar.ts";
import { substringFilter } from "../src/lib/search.ts";

const ROLES = ["ServiceNow", "IT Operations", "SRE", "Software Developer", "Batch Operations", "Site Reliability Engineer", "Data Engineer"].map((name, i) => ({ id: String(i), name }));
const names = (q: string) => findNames(q, ROLES).map((m) => m.item.name);

test("typing a longer name finds the shorter one it contains, and it can still be added", () => {
  const found = findNames("ITOM ServiceNow", ROLES);
  assert.equal(found[0].item.name, "ServiceNow");
  assert.equal(found[0].same, false, "not the same name: adding ITOM ServiceNow is allowed");
});

test("the same name apart from case, spacing and punctuation is taken", () => {
  for (const q of ["servicenow", "Service Now", "SERVICE-NOW", " ServiceNow "]) {
    assert.equal(findNames(q, ROLES)[0].same, true, q);
    assert.equal(sameName(q, "ServiceNow"), true, q);
  }
  assert.equal(sameName("ITOM ServiceNow", "ServiceNow"), false);
  assert.equal(sameName("", ""), false, "an empty name is nobody's name");
});

test("words are found anywhere in the name, in any order", () => {
  assert.deepEqual(names("operations it"), ["IT Operations", "Batch Operations"], "both words first, then one of them");
  assert.deepEqual(names("developer"), ["Software Developer"]);
  assert.ok(names("oper").includes("IT Operations") && names("oper").includes("Batch Operations"), "part of a word");
  assert.equal(names("now")[0], "ServiceNow", "the end of a word");
});

test("it follows the typing, from the first letter", () => {
  assert.ok(names("s").includes("ServiceNow") && names("s").includes("SRE") && names("s").includes("Software Developer"));
  assert.ok(!names("s").includes("Data Engineer"), "one letter finds the start of a word only");
  assert.deepEqual(names("se"), ["ServiceNow"]);
  assert.deepEqual(names("xyz"), []);
  assert.deepEqual(names(""), []);
});

test("initials find the long name", () => {
  assert.ok(names("SRE").includes("Site Reliability Engineer"));
  assert.equal(names("SRE")[0], "SRE", "the role with exactly that name comes first");
});

test("other names a skill goes by are searched too", () => {
  const skills = [{ name: "Kubernetes", aliases: ["K8s", "kube"] }, { name: "Kafka" }];
  assert.equal(findNames("k8s", skills)[0].item.name, "Kubernetes");
  assert.equal(matchScore("kube", "Kubernetes"), 0.95);
});

test("names compare without accents and punctuation; C++ and C# stay themselves", () => {
  assert.equal(normName("  Café-Ops & Co. "), "cafe ops and co");
  assert.equal(sameName("C++", "C#"), false);
  assert.equal(sameName("c++", "C++"), true);
});

test("pickers use the same matching: all the words, any order, the best first", () => {
  assert.ok(substringFilter("aws › iam cloud", "iam aws") > substringFilter("aws › s3 cloud", "iam aws"));
  assert.equal(substringFilter("stakeholder management ways of working", "helm"), 0, "letters scattered through a name do not match");
  assert.equal(substringFilter("__new__ anything", "zzz"), 1, "the row that adds a new one always shows");
});
