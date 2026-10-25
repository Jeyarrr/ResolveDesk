CREATE TABLE "runtime_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "runtime_counter_expiry_idx" ON "runtime_counters" USING btree ("expires_at");