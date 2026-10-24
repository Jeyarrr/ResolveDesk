CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"assignments" boolean DEFAULT true NOT NULL,
	"replies" boolean DEFAULT true NOT NULL,
	"status" boolean DEFAULT true NOT NULL,
	"escalations" boolean DEFAULT true NOT NULL,
	"sla" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"recipients" jsonb NOT NULL,
	"audience" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "operation_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"priority" "priority" NOT NULL,
	"response_minutes" integer NOT NULL,
	"resolution_minutes" integer NOT NULL,
	"warning_percent" integer DEFAULT 80 NOT NULL,
	"calendar" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_policies_priority_unique" UNIQUE("priority"),
	CONSTRAINT "sla_policy_bounds" CHECK ("sla_policies"."response_minutes" BETWEEN 1 AND 525600 AND "sla_policies"."resolution_minutes" BETWEEN 1 AND 525600 AND "sla_policies"."warning_percent" BETWEEN 1 AND 99)
);
--> statement-breakpoint
CREATE TABLE "ticket_slas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"response_due_at" timestamp with time zone NOT NULL,
	"resolution_due_at" timestamp with time zone NOT NULL,
	"response_warning_at" timestamp with time zone NOT NULL,
	"resolution_warning_at" timestamp with time zone NOT NULL,
	"first_responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"response_minutes" integer,
	"resolution_minutes" integer,
	"response_breached_at" timestamp with time zone,
	"resolution_breached_at" timestamp with time zone,
	"response_warned_at" timestamp with time zone,
	"resolution_warned_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_cycle_positive" CHECK ("ticket_slas"."cycle" > 0)
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_operation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."operation_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_slas" ADD CONSTRAINT "ticket_slas_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_slas" ADD CONSTRAINT "ticket_slas_policy_id_sla_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."sla_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_recipient_unique" ON "notifications" USING btree ("event_id","recipient_id");--> statement-breakpoint
CREATE INDEX "notification_recipient_date_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notifications" USING btree ("recipient_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "events_pending_idx" ON "operation_events" USING btree ("created_at") WHERE "operation_events"."processed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sla_ticket_cycle_unique" ON "ticket_slas" USING btree ("ticket_id","cycle");--> statement-breakpoint
CREATE INDEX "sla_due_idx" ON "ticket_slas" USING btree ("next_check_at");
--> statement-breakpoint
INSERT INTO sla_policies (name,priority,response_minutes,resolution_minutes,warning_percent,calendar) VALUES
('Low priority','low',960,2400,80,'{"timezone":"Asia/Manila","startHour":9,"endHour":18,"weekdays":[1,2,3,4,5],"holidays":[]}'),
('Medium priority','medium',480,1440,80,'{"timezone":"Asia/Manila","startHour":9,"endHour":18,"weekdays":[1,2,3,4,5],"holidays":[]}'),
('High priority','high',120,480,80,'{"timezone":"Asia/Manila","startHour":9,"endHour":18,"weekdays":[1,2,3,4,5],"holidays":[]}'),
('Critical priority','critical',30,240,80,'{"timezone":"Asia/Manila","startHour":9,"endHour":18,"weekdays":[1,2,3,4,5],"holidays":[]}');
