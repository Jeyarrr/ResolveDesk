ALTER TABLE "ticket_activity" ADD COLUMN "explanation" text;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD COLUMN "lifecycle_version" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution_summary" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "lifecycle_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_ticket_lifecycle_version_unique" ON "ticket_activity" USING btree ("ticket_id","lifecycle_version");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "ticket_lifecycle_version_nonnegative" CHECK ("tickets"."lifecycle_version" >= 0);--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "ticket_resolution_details_consistency" CHECK ((("tickets"."resolved_by" IS NULL) = ("tickets"."resolution_summary" IS NULL)) AND ("tickets"."resolved_by" IS NULL OR ("tickets"."status" IN ('resolved','closed') AND length(trim("tickets"."resolution_summary")) BETWEEN 20 AND 5000)) AND ("tickets"."closed_by" IS NULL OR "tickets"."status" = 'closed'));