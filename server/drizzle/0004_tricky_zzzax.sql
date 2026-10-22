CREATE TABLE "ticket_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"acknowledged_by" uuid,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "escalation_reason_length" CHECK (length(trim("ticket_escalations"."reason")) BETWEEN 10 AND 2000),
	CONSTRAINT "escalation_state_consistency" CHECK ("ticket_escalations"."status" IN ('open', 'acknowledged', 'resolved') AND (("ticket_escalations"."acknowledged_by" IS NULL) = ("ticket_escalations"."acknowledged_at" IS NULL)) AND (("ticket_escalations"."resolved_by" IS NULL) = ("ticket_escalations"."resolved_at" IS NULL)) AND (("ticket_escalations"."status" = 'resolved') = ("ticket_escalations"."resolved_at" IS NOT NULL)) AND ("ticket_escalations"."status" <> 'acknowledged' OR "ticket_escalations"."acknowledged_at" IS NOT NULL) AND ("ticket_escalations"."status" <> 'open' OR "ticket_escalations"."acknowledged_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escalations_one_active_per_ticket" ON "ticket_escalations" USING btree ("ticket_id") WHERE "ticket_escalations"."status" IN ('open', 'acknowledged');--> statement-breakpoint
CREATE INDEX "escalations_status_created_idx" ON "ticket_escalations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "escalations_ticket_created_idx" ON "ticket_escalations" USING btree ("ticket_id","created_at");