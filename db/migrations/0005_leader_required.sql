-- Every level must always have a leader (spec §3 and §5, ADR 0014).
--
-- The rules span two rows (a unit and its leader's membership), so a CHECK can't express them.
-- Instead, CONSTRAINT TRIGGERs that are DEFERRABLE INITIALLY DEFERRED run at COMMIT, not after
-- each statement. Inside one transaction you may create a unit and then its leader, or end one
-- leader and then appoint the next (a handover). But no transaction can COMMIT leaving:
--   1. an active org_unit without an active leader, or
--   2. a leadership post (once filled) without an active holder.
-- Archived units (active = false) need no leader.
--
-- Existing rows aren't re-checked; the checks fire on future writes. The seed has always given
-- every unit a leader, so existing data already satisfies the rule.

CREATE FUNCTION org_unit_require_leader() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_unit_id uuid;
BEGIN
  -- Fired by org_unit (the unit was created or changed), or by membership (a leader went away).
  IF TG_TABLE_NAME = 'org_unit' THEN
    v_unit_id := NEW.id;
  ELSE
    v_unit_id := OLD.unit_id;
  END IF;

  IF EXISTS (SELECT 1 FROM org_unit u WHERE u.id = v_unit_id AND u.active)
     AND NOT EXISTS (
       SELECT 1 FROM membership m
       WHERE m.unit_id = v_unit_id AND m.role = 'leader' AND m.end_date IS NULL
     ) THEN
    RAISE EXCEPTION 'org_unit % has no active leader', v_unit_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'org_unit_requires_leader',
            HINT = 'Create a unit together with its leader, and hand over leadership in one transaction.';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER org_unit_requires_leader
  AFTER INSERT OR UPDATE ON org_unit
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION org_unit_require_leader();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER membership_keeps_unit_leader
  AFTER UPDATE OR DELETE ON membership
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.role = 'leader')
  EXECUTE FUNCTION org_unit_require_leader();
--> statement-breakpoint
CREATE FUNCTION leadership_post_require_holder() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM leadership_post p WHERE p.post = OLD.post AND p.end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'leadership post % has no active holder', OLD.post
      USING ERRCODE = 'check_violation', CONSTRAINT = 'leadership_post_requires_holder',
            HINT = 'End a post and appoint the successor in one transaction.';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER leadership_post_requires_holder
  AFTER UPDATE OR DELETE ON leadership_post
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION leadership_post_require_holder();
