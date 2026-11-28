CREATE TABLE "team_person_skill" (
	"manager_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"target" integer NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "team_person_skill_manager_id_employee_id_skill_id_pk" PRIMARY KEY("manager_id","employee_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "team_person_skill" ADD CONSTRAINT "team_person_skill_manager_id_employee_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_person_skill" ADD CONSTRAINT "team_person_skill_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_person_skill" ADD CONSTRAINT "team_person_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_person_skill_employee_idx" ON "team_person_skill" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "team_person_skill_skill_idx" ON "team_person_skill" USING btree ("skill_id");