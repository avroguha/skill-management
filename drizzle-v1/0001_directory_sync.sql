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
ALTER TABLE "employee" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "user_name" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "user_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_unit" ADD COLUMN "external_key" text;--> statement-breakpoint
CREATE INDEX "sync_run_started_idx" ON "sync_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "employee_user_name_idx" ON "employee" USING btree ("user_name");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_external_key_unique" UNIQUE("external_key");