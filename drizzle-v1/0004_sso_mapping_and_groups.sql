CREATE TABLE "group_member" (
	"group_id" text NOT NULL,
	"employee_id" text NOT NULL,
	CONSTRAINT "group_member_group_id_employee_id_pk" PRIMARY KEY("group_id","employee_id")
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
ALTER TABLE "sso_pending" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_sn_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."sn_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_member_employee_idx" ON "group_member" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "sn_group_name_idx" ON "sn_group" USING btree ("name");