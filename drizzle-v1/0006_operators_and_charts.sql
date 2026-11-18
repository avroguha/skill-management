CREATE TABLE "operator_scope" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"added_by" text DEFAULT '' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_scope_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "saved_chart" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"config" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operator_scope" ADD CONSTRAINT "operator_scope_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_chart" ADD CONSTRAINT "saved_chart_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_chart_owner_idx" ON "saved_chart" USING btree ("owner_id");