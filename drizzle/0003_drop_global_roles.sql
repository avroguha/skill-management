ALTER TABLE "job_role" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_skill" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "job_role" CASCADE;--> statement-breakpoint
DROP TABLE "role_skill" CASCADE;--> statement-breakpoint
ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "employee_role_id_job_role_id_fk";
--> statement-breakpoint
ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "employee_team_role_id_job_role_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "employee_role_idx";--> statement-breakpoint
ALTER TABLE "employee" DROP COLUMN "role_id";--> statement-breakpoint
ALTER TABLE "employee" DROP COLUMN "team_role_id";--> statement-breakpoint
ALTER TABLE "employee" DROP COLUMN "team_role_cascade";