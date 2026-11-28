CREATE TYPE "public"."leadership_post_kind" AS ENUM('program_director', 'supervising_preacher');--> statement-breakpoint
CREATE TABLE "leadership_post" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"post" "leadership_post_kind" NOT NULL,
	"start_date" date DEFAULT now() NOT NULL,
	"end_date" date,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "leadership_post_dates" CHECK ("leadership_post"."end_date" IS NULL OR "leadership_post"."end_date" >= "leadership_post"."start_date"),
	CONSTRAINT "leadership_post_end_reason" CHECK ("leadership_post"."end_reason" IS NULL OR "leadership_post"."end_date" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "leadership_post" ADD CONSTRAINT "leadership_post_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leadership_post_one_active_holder" ON "leadership_post" USING btree ("post") WHERE "leadership_post"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX "leadership_post_person_id_idx" ON "leadership_post" USING btree ("person_id");