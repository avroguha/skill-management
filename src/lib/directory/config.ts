// Directory (ServiceNow sys_user) settings, stored in app_setting "directory".
// The password is sealed (secret-box) and never sent to the browser: the admin page
// gets `hasPassword` instead, and an empty password field on save keeps the old one.
import { eq } from "drizzle-orm";
import type { DB } from "../../db/index.ts";
import * as s from "../../db/schema.ts";
import { open, seal } from "../secret-box.ts";

export interface FieldMap {
  userName: string;
  name: string;
  email: string;
  manager: string;
  title: string;
}

/** "designation is / contains / starts with <text>" -> a role, and optionally a grade. */
export type RuleOp = "is" | "contains" | "starts";
export interface RoleRule {
  op: RuleOp;
  text: string;
  roleId: string;
  /** "" = leave the grade as it is */
  gradeId: string;
}

export interface DirectoryConfig {
  enabled: boolean;
  instanceUrl: string;
  username: string;
  /** sealed; empty when not set */
  passwordSealed: string;
  table: string;
  /** the top of the tree: everyone under this login name is brought in, recursively */
  rootUserName: string;
  /** the field that tells people from service accounts, e.g. identity_type */
  typeField: string;
  /** values of typeField that are brought in; empty = everyone */
  typeValues: string[];
  /** an extra encoded query every fetched record must match, e.g. active=true */
  extraQuery: string;
  fields: FieldMap;
  /** more fields to store with each person (for the photo URL, the info panel) */
  extraFields: string[];
  /** build the organisation tree from the manager chain (a team per manager) */
  orgFromHierarchy: boolean;
  /** 0 = manual only */
  syncEveryHours: number;
  maxPeople: number;
  /** roles from designations, checked top to bottom; the first match wins */
  roleRules: RoleRule[];
  /** false: rules only fill an empty role (hand-set roles are kept); true: they also change one */
  roleRulesOverwrite: boolean;
}

export const DEFAULT_DIRECTORY: DirectoryConfig = {
  enabled: false,
  instanceUrl: "",
  username: "",
  passwordSealed: "",
  table: "sys_user",
  rootUserName: "",
  typeField: "identity_type",
  typeValues: ["human"],
  extraQuery: "active=true",
  fields: { userName: "user_name", name: "name", email: "email", manager: "manager", title: "title" },
  extraFields: [],
  orgFromHierarchy: true,
  syncEveryHours: 12,
  maxPeople: 20000,
  roleRules: [],
  roleRulesOverwrite: false,
};

const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

/** The first rule whose text matches the designation (case and spacing ignored), or null. */
export function matchRoleRule(rules: RoleRule[], title: string): RoleRule | null {
  const t = norm(title);
  if (!t) return null;
  for (const r of rules) {
    const x = norm(r.text);
    if (!x || !r.roleId) continue;
    if (r.op === "is" ? t === x : r.op === "starts" ? t.startsWith(x) : t.includes(x)) return r;
  }
  return null;
}

export async function readDirectoryConfig(db: DB): Promise<DirectoryConfig> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "directory"));
  const v = (row?.value ?? {}) as Partial<DirectoryConfig>;
  return { ...DEFAULT_DIRECTORY, ...v, fields: { ...DEFAULT_DIRECTORY.fields, ...(v.fields ?? {}) } };
}

export async function writeDirectoryConfig(db: DB, c: DirectoryConfig): Promise<void> {
  await db.insert(s.appSetting).values({ key: "directory", value: c })
    .onConflictDoUpdate({ target: s.appSetting.key, set: { value: c } });
}

export function directoryPassword(c: DirectoryConfig): string {
  return c.passwordSealed ? open(c.passwordSealed) : "";
}

export function sealPassword(plain: string): string {
  return seal(plain);
}

/** What the admin page may see: everything but the password. */
export function publicDirectoryConfig(c: DirectoryConfig) {
  const { passwordSealed, ...rest } = c;
  return { ...rest, hasPassword: !!passwordSealed };
}

export interface ProfileSettings {
  /** e.g. https://photos.avro.com/{user_name}.jpg - {field} is replaced from the person */
  photoUrlTemplate: string;
}

export async function readProfileSettings(db: DB): Promise<ProfileSettings> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "profile"));
  return { photoUrlTemplate: "", ...((row?.value ?? {}) as Partial<ProfileSettings>) };
}

/** Fills {placeholders} from a person; null when any placeholder has no value. */
export function photoUrl(template: string, person: { email: string; userName: string | null; externalId: string | null; attributes: Record<string, string> }): string | null {
  if (!template.trim()) return null;
  let missing = false;
  const url = template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, k: string) => {
    const v = k === "email" ? person.email
      : k === "user_name" || k === "userName" ? person.userName
        : k === "sys_id" || k === "id" ? person.externalId
          : person.attributes[k];
    if (!v) { missing = true; return ""; }
    return encodeURIComponent(v);
  });
  return missing ? null : url;
}
