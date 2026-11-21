-- audit_log is append-only (spec §5): history must not be rewritten, even by the app.
-- A trigger is a database-level guarantee that holds whatever code, script or console session
-- connects. In production the app's database role additionally lacks UPDATE/DELETE grants (T10).
CREATE FUNCTION audit_log_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_forbid_change();
--> statement-breakpoint
-- TRUNCATE bypasses row triggers, so block it with a statement-level trigger too.
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_forbid_change();
