CREATE TYPE "public"."app_user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('active', 'inactive', 'moved', 'deceased', 'archived');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"changes" jsonb,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"email" text NOT NULL,
	"google_sub" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"status" "app_user_status" DEFAULT 'invited' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "app_user_email_lowercase" CHECK ("app_user"."email" = lower("app_user"."email"))
);
--> statement-breakpoint
CREATE TABLE "user_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"refresh_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"locality" text NOT NULL,
	"email" text,
	"phone_e164" text,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "person_legal_name_not_blank" CHECK (btrim("person"."legal_name") <> ''),
	CONSTRAINT "person_display_name_not_blank" CHECK (btrim("person"."display_name") <> ''),
	CONSTRAINT "person_phone_e164_format" CHECK ("person"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "person_email_lowercase" CHECK ("person"."email" = lower("person"."email"))
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_person_id_key" ON "app_user" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_google_sub_key" ON "app_user" USING btree ("google_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "user_session_refresh_hash_key" ON "user_session" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "user_session_user_id_idx" ON "user_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_session_family_id_idx" ON "user_session" USING btree ("family_id");