CREATE TABLE "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"comment_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"storage_key" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ticket_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachment_size_valid" CHECK ("ticket_attachments"."file_size" > 0 AND "ticket_attachments"."file_size" <= 10485760),
	CONSTRAINT "attachment_mime_valid" CHECK ("ticket_attachments"."mime_type" IN ('image/png','image/jpeg','image/webp','application/pdf','text/plain'))
);
--> statement-breakpoint
CREATE TABLE "conversation_reads" (
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_position" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reads_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id"),
	CONSTRAINT "read_position_nonnegative" CHECK ("conversation_reads"."last_position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "response_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_lengths" CHECK (length(trim("response_templates"."title")) BETWEEN 2 AND 100 AND length(trim("response_templates"."body")) BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "ticket_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"ticket_id" uuid,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD COLUMN "position" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "ticket_comments_position_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_submission_id_ticket_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."ticket_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comments_ticket_id_unique" ON "ticket_comments" USING btree ("ticket_id","id");--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "attachments_comment_ticket_fk" FOREIGN KEY ("ticket_id","comment_id") REFERENCES "public"."ticket_comments"("ticket_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_submissions" ADD CONSTRAINT "ticket_submissions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_submissions" ADD CONSTRAINT "ticket_submissions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_ticket_created_idx" ON "ticket_attachments" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "attachments_comment_idx" ON "ticket_attachments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "templates_active_title_idx" ON "response_templates" USING btree ("active","title");--> statement-breakpoint

CREATE INDEX "comments_ticket_position_idx" ON "ticket_comments" USING btree ("ticket_id","position");--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_position_unique" UNIQUE("position");