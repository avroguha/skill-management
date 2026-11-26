CREATE TABLE "catalogue_request" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" text,
	"category_name" text DEFAULT '' NOT NULL,
	"parent_id" text,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" text,
	"requested_by_employee_id" text,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_by_name" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"comment" text DEFAULT '' NOT NULL,
	"result_id" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_draft" (
	"manager_id" text PRIMARY KEY NOT NULL,
	"doc" jsonb NOT NULL,
	"author_id" text,
	"author_name" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_role" (
	"id" text PRIMARY KEY NOT NULL,
	"manager_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_role_member" (
	"role_id" text NOT NULL,
	"employee_id" text NOT NULL,
	CONSTRAINT "team_role_member_role_id_employee_id_pk" PRIMARY KEY("role_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "team_role_skill" (
	"role_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"target" integer NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	CONSTRAINT "team_role_skill_role_id_skill_id_pk" PRIMARY KEY("role_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "team_need" ADD COLUMN "dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_draft" ADD CONSTRAINT "team_draft_manager_id_employee_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role" ADD CONSTRAINT "team_role_manager_id_employee_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_member" ADD CONSTRAINT "team_role_member_role_id_team_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."team_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_member" ADD CONSTRAINT "team_role_member_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_skill" ADD CONSTRAINT "team_role_skill_role_id_team_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."team_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_skill" ADD CONSTRAINT "team_role_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogue_request_status_idx" ON "catalogue_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalogue_request_by_idx" ON "catalogue_request" USING btree ("requested_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_role_name_uq" ON "team_role" USING btree ("manager_id","name");--> statement-breakpoint
CREATE INDEX "team_role_manager_idx" ON "team_role" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "team_role_member_employee_idx" ON "team_role_member" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "team_role_skill_skill_idx" ON "team_role_skill" USING btree ("skill_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_role','team_role_member','team_role_skill'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version()', 'bump_version_' || t, t);
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Roles used to be one list for the whole organisation, chosen for a team by its manager.
-- They become roles of each team: every person keeps the role that counted for them (their
-- own, else their manager's choice, else the nearest choice above made "for everyone below"),
-- as a role of their manager's team with the same name and the same skills.
-- The same rule in code: src/lib/legacy-roles.ts (test/legacy-roles.test.ts checks both agree).
CREATE TEMP TABLE "_role_src" ON COMMIT DROP AS
WITH RECURSIVE anc AS (
  SELECT n."id" AS mgr, n."manager_id" AS a, 1 AS d FROM "employee" n
    WHERE n."team_role_id" IS NULL AND n."manager_id" IS NOT NULL AND n."manager_id" <> n."id"
  UNION ALL
  SELECT anc.mgr, u."manager_id", anc.d + 1 FROM anc JOIN "employee" u ON u."id" = anc.a
    WHERE u."manager_id" IS NOT NULL AND u."manager_id" <> u."id" AND anc.d < 40
), hit AS (
  SELECT DISTINCT ON (anc.mgr) anc.mgr, u."team_role_id" AS role_id FROM anc JOIN "employee" u ON u."id" = anc.a
    WHERE u."team_role_id" IS NOT NULL AND u."team_role_cascade" ORDER BY anc.mgr, anc.d
)
SELECT e."id" AS manager_id, COALESCE(e."team_role_id", hit.role_id) AS role_id FROM "employee" e LEFT JOIN hit ON hit.mgr = e."id";
--> statement-breakpoint
CREATE TEMP TABLE "_role_eff" ON COMMIT DROP AS
SELECT p."id" AS employee_id, p."manager_id" AS manager_id, COALESCE(p."role_id", p."team_role_id", s.role_id) AS role_id
FROM "employee" p JOIN "employee" m ON m."id" = p."manager_id" LEFT JOIN "_role_src" s ON s.manager_id = p."manager_id"
WHERE p."active" AND p."manager_id" <> p."id";
--> statement-breakpoint
INSERT INTO "team_role" ("id", "manager_id", "name", "description")
SELECT md5(x.manager_id || ':' || x.role_id), x.manager_id, r."name", r."description"
FROM (SELECT DISTINCT manager_id, role_id FROM "_role_eff" WHERE role_id IS NOT NULL) x JOIN "job_role" r ON r."id" = x.role_id;
--> statement-breakpoint
INSERT INTO "team_role_member" ("role_id", "employee_id")
SELECT md5(e.manager_id || ':' || e.role_id), e.employee_id FROM "_role_eff" e JOIN "job_role" r ON r."id" = e.role_id;
--> statement-breakpoint
INSERT INTO "team_role_skill" ("role_id", "skill_id", "target", "mandatory")
SELECT md5(x.manager_id || ':' || x.role_id), rs."skill_id",
  COALESCE(MAX(rs."target") FILTER (WHERE rs."grade_id" IS NULL), MAX(rs."target")), bool_or(rs."mandatory")
FROM (SELECT DISTINCT manager_id, role_id FROM "_role_eff" WHERE role_id IS NOT NULL) x
  JOIN "job_role" r ON r."id" = x.role_id JOIN "role_skill" rs ON rs."role_id" = x.role_id
GROUP BY x.manager_id, x.role_id, rs."skill_id";
--> statement-breakpoint
-- A skill someone suggested used to wait as a draft skill. It is a request now: a coordinator
-- or an administrator approves it, sends it back or says no (Requests).
INSERT INTO "catalogue_request" ("id", "kind", "name", "category_id", "parent_id", "reason", "status", "requested_by_name")
SELECT md5('request:' || k."id"), 'skill', k."name", k."category_id", k."parent_id", k."description", 'pending', ''
FROM "skill" k WHERE k."status" = 'draft';
--> statement-breakpoint
DELETE FROM "skill" WHERE "status" = 'draft';
