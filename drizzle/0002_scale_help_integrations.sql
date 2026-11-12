CREATE TABLE "api_client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tool" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text NOT NULL,
	"datasets" jsonb NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_client_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "data_version" (
	"id" integer PRIMARY KEY NOT NULL,
	"v" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'question' NOT NULL,
	"message" text NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"handled_by" text,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_lease" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_pending" (
	"email" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_at_idx" ON "feedback" USING btree ("at");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sso_attempt_at_idx" ON "sso_attempt" USING btree ("at");--> statement-breakpoint
INSERT INTO "data_version" ("id", "v") VALUES (1, 1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bump_data_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE data_version SET v = v + 1 WHERE id = 1;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_unit','employee','skill_category','skill','job_role','grade','role_skill','unit_requirement','employee_target','rating','app_setting'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version()', 'bump_version_' || t, t);
  END LOOP;
END;
$$;
