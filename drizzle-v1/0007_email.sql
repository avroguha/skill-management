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
CREATE INDEX "email_message_due_idx" ON "email_message" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "email_message_created_idx" ON "email_message" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_dedupe_uq" ON "email_message" USING btree ("dedupe_key");