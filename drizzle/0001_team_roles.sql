ALTER TABLE "employee" ADD COLUMN "team_role_id" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "team_role_cascade" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_team_role_id_job_role_id_fk" FOREIGN KEY ("team_role_id") REFERENCES "public"."job_role"("id") ON DELETE set null ON UPDATE no action;