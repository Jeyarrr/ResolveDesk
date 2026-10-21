ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("users"."username" IS NULL OR "users"."username" ~ '^[a-z0-9_][a-z0-9_.-]{2,31}$');