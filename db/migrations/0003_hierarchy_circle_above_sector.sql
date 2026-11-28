-- ADR 0013: the tree is now Circle → Sector → Bhakti Vriksha (it was Sector → Circle → BV).
--
-- EXPAND step. The new rule is added NOT VALID: Postgres enforces it on every row inserted or
-- updated from now on, but does not re-check rows already there. Databases seeded with the old
-- shape (local, staging) therefore migrate cleanly instead of failing, and nothing is deleted.
-- Reseed them (`pnpm seed --reset`) to get the new shape.
--
-- CONTRACT step (a later migration, once every environment has been reseeded):
--   ALTER TABLE "org_unit" VALIDATE CONSTRAINT "org_unit_parent_kind_rule";
ALTER TABLE "org_unit" DROP CONSTRAINT "org_unit_parent_kind_rule";--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_kind_rule" CHECK (("org_unit"."kind" = 'circle' AND "org_unit"."parent_id" IS NULL AND "org_unit"."parent_kind" IS NULL)
       OR ("org_unit"."kind" = 'sector' AND "org_unit"."parent_id" IS NOT NULL AND "org_unit"."parent_kind" = 'circle')
       OR ("org_unit"."kind" = 'bhakti_vriksha' AND "org_unit"."parent_id" IS NOT NULL AND "org_unit"."parent_kind" = 'sector')) NOT VALID;
