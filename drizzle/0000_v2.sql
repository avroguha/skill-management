CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "data_version" (
	"id" integer PRIMARY KEY NOT NULL,
	"v" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_message" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"employee_id" text,
	"to_email" text NOT NULL,
	"to_name" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"role_id" text,
	"grade_id" text,
	"manager_id" text,
	"user_id" text,
	"location" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"user_name" text,
	"user_type" text DEFAULT '' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_email_unique" UNIQUE("email"),
	CONSTRAINT "employee_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employee_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "grade" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "grade_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_id" text NOT NULL,
	"employee_id" text NOT NULL,
	CONSTRAINT "group_member_group_id_employee_id_pk" PRIMARY KEY("group_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "job_lease" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_role" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_role_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "proficiency_level" (
	"level" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating" (
	"employee_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"self_level" integer,
	"self_comment" text DEFAULT '' NOT NULL,
	"self_at" timestamp with time zone,
	"validated_level" integer,
	"validated_by" text,
	"validated_at" timestamp with time zone,
	"manager_comment" text DEFAULT '' NOT NULL,
	"interest" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "rating_employee_id_skill_id_pk" PRIMARY KEY("employee_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "rating_event" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"kind" text NOT NULL,
	"level" integer,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"grade_id" text,
	"skill_id" text NOT NULL,
	"target" integer NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "skill_category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sn_group" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"manager_external_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sn_group_external_id_unique" UNIQUE("external_id")
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
	"profile" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"deactivated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_need" (
	"id" text PRIMARY KEY NOT NULL,
	"manager_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"min_level" integer NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"must_change_password" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_role_id_job_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."job_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_grade_id_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_sn_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."sn_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_skill" ADD CONSTRAINT "role_skill_role_id_job_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."job_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_skill" ADD CONSTRAINT "role_skill_grade_id_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_skill" ADD CONSTRAINT "role_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_category_id_skill_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_need" ADD CONSTRAINT "team_need_manager_id_employee_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_need" ADD CONSTRAINT "team_need_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "email_message_due_idx" ON "email_message" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "email_message_created_idx" ON "email_message" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_dedupe_uq" ON "email_message" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "employee_manager_idx" ON "employee" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "employee_user_name_idx" ON "employee" USING btree ("user_name");--> statement-breakpoint
CREATE INDEX "employee_role_idx" ON "employee" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "employee_grade_idx" ON "employee" USING btree ("grade_id");--> statement-breakpoint
CREATE INDEX "group_member_employee_idx" ON "group_member" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "rating_status_idx" ON "rating" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rating_skill_idx" ON "rating" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "rating_event_emp_idx" ON "rating_event" USING btree ("employee_id","skill_id");--> statement-breakpoint
CREATE INDEX "rating_event_at_idx" ON "rating_event" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_skill_uq" ON "role_skill" USING btree ("role_id","grade_id","skill_id");--> statement-breakpoint
CREATE INDEX "role_skill_skill_idx" ON "role_skill" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_category_idx" ON "skill" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "skill_parent_idx" ON "skill" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "sn_group_name_idx" ON "sn_group" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sso_attempt_at_idx" ON "sso_attempt" USING btree ("at");--> statement-breakpoint
CREATE INDEX "sync_run_started_idx" ON "sync_run" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_need_uq" ON "team_need" USING btree ("manager_id","skill_id");--> statement-breakpoint
CREATE INDEX "team_need_skill_idx" ON "team_need" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
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
  FOREACH t IN ARRAY ARRAY['employee','skill_category','skill','job_role','grade','role_skill','team_need','rating','app_setting'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version()', 'bump_version_' || t, t);
  END LOOP;
END;
$$;
