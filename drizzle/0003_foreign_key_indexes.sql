CREATE INDEX "employee_role_idx" ON "employee" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "employee_grade_idx" ON "employee" USING btree ("grade_id");--> statement-breakpoint
CREATE INDEX "employee_target_skill_idx" ON "employee_target" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "rating_skill_idx" ON "rating" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "rating_event_at_idx" ON "rating_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "role_skill_skill_idx" ON "role_skill" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "training_plan_skill_idx" ON "training_plan" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "unit_requirement_skill_idx" ON "unit_requirement" USING btree ("skill_id");