CREATE TABLE "open_position" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"title" text NOT NULL,
	"role_id" text,
	"grade_id" text,
	"headcount" integer DEFAULT 1 NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "open_position" ADD CONSTRAINT "open_position_unit_id_org_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."org_unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_position" ADD CONSTRAINT "open_position_role_id_job_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."job_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_position" ADD CONSTRAINT "open_position_grade_id_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_position_unit_idx" ON "open_position" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX "open_position_role_idx" ON "open_position" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "open_position_grade_idx" ON "open_position" USING btree ("grade_id");