CREATE TYPE "public"."membership_role" AS ENUM('member', 'leader', 'co_leader', 'owner', 'facilitator');--> statement-breakpoint
CREATE TYPE "public"."org_unit_kind" AS ENUM('sector', 'circle', 'bhakti_vriksha');--> statement-breakpoint
CREATE TYPE "public"."weekday" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_kind" "org_unit_kind" NOT NULL,
	"role" "membership_role" NOT NULL,
	"start_date" date DEFAULT now() NOT NULL,
	"end_date" date,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "membership_unit_role" CHECK ("membership"."role" IN ('member', 'leader', 'co_leader')),
	CONSTRAINT "membership_dates" CHECK ("membership"."end_date" IS NULL OR "membership"."end_date" >= "membership"."start_date"),
	CONSTRAINT "membership_end_reason" CHECK ("membership"."end_reason" IS NULL OR "membership"."end_date" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "org_unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "org_unit_kind" NOT NULL,
	"parent_id" uuid,
	"parent_kind" "org_unit_kind",
	"name" text NOT NULL,
	"locality" text,
	"meeting_day" "weekday",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "org_unit_id_kind_key" UNIQUE("id","kind"),
	CONSTRAINT "org_unit_sibling_name_key" UNIQUE NULLS NOT DISTINCT("parent_id","name"),
	CONSTRAINT "org_unit_parent_kind_rule" CHECK (("org_unit"."kind" = 'sector' AND "org_unit"."parent_id" IS NULL AND "org_unit"."parent_kind" IS NULL)
       OR ("org_unit"."kind" = 'circle' AND "org_unit"."parent_id" IS NOT NULL AND "org_unit"."parent_kind" = 'sector')
       OR ("org_unit"."kind" = 'bhakti_vriksha' AND "org_unit"."parent_id" IS NOT NULL AND "org_unit"."parent_kind" = 'circle')),
	CONSTRAINT "org_unit_name_not_blank" CHECK (btrim("org_unit"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_unit_fk" FOREIGN KEY ("unit_id","unit_kind") REFERENCES "public"."org_unit"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_fk" FOREIGN KEY ("parent_id","parent_kind") REFERENCES "public"."org_unit"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_active_bv" ON "membership" USING btree ("person_id") WHERE "membership"."end_date" IS NULL AND "membership"."role" = 'member' AND "membership"."unit_kind" = 'bhakti_vriksha';--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_active_leader" ON "membership" USING btree ("unit_id") WHERE "membership"."end_date" IS NULL AND "membership"."role" = 'leader';--> statement-breakpoint
CREATE UNIQUE INDEX "membership_active_unique" ON "membership" USING btree ("person_id","unit_id","role") WHERE "membership"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX "membership_unit_id_idx" ON "membership" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "org_unit_parent_id_idx" ON "org_unit" USING btree ("parent_id");