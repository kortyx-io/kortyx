ALTER TABLE "eval_runs" ADD COLUMN "live_projection" jsonb;--> statement-breakpoint
CREATE INDEX "eval_runs_live_projection_idx" ON "eval_runs" USING gin ("live_projection" jsonb_path_ops);
--> statement-breakpoint
-- Older/custom writers remain correct. Native progress writes replace this
-- invalidation with an updated compact projection in the same transaction.
CREATE FUNCTION kortyx_invalidate_eval_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE eval_runs SET live_projection = NULL
    WHERE id = NEW.run_id AND organization_id = NEW.organization_id AND project_id = NEW.project_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER eval_progress_projection_invalidated AFTER INSERT ON eval_run_events
  FOR EACH ROW EXECUTE FUNCTION kortyx_invalidate_eval_progress();
--> statement-breakpoint
CREATE FUNCTION kortyx_invalidate_eval_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.result IS DISTINCT FROM OLD.result THEN NEW.live_projection = NULL; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER eval_result_projection_invalidated BEFORE UPDATE OF result ON eval_runs
  FOR EACH ROW EXECUTE FUNCTION kortyx_invalidate_eval_result();
--> statement-breakpoint
-- Keep only identities dirty, never copy model responses into a read projection.
-- Normal ingestion prices these identities before commit; older writers are
-- reconciled once under the run lock on the next read.
CREATE FUNCTION kortyx_dirty_eval_billing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity_key text;
BEGIN
  IF NEW.type <> 'generation.completed' THEN RETURN NEW; END IF;
  IF current_setting('kortyx.managed_eval_billing', true) = 'true' THEN RETURN NEW; END IF;
  IF NEW.payload->>'evalAttemptId' IS NOT NULL THEN
    identity_key := 'a:' || (NEW.payload->>'evalAttemptId');
    UPDATE eval_runs SET live_projection = jsonb_set(live_projection, '{dirtyBilling}',
      coalesce(live_projection->'dirtyBilling', '{}'::jsonb) || jsonb_build_object(identity_key, true))
    WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id AND environment = NEW.environment
      AND live_projection @> jsonb_build_object('attemptIds', jsonb_build_array(NEW.payload->>'evalAttemptId'));
  ELSIF NEW.session_id IS NOT NULL THEN
    identity_key := 's:' || NEW.session_id;
    UPDATE eval_runs SET live_projection = jsonb_set(live_projection, '{dirtyBilling}',
      coalesce(live_projection->'dirtyBilling', '{}'::jsonb) || jsonb_build_object(identity_key, true))
    WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id AND environment = NEW.environment
      AND live_projection @> jsonb_build_object('sessionIds', jsonb_build_array(NEW.session_id));
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER eval_billing_projection_dirtied AFTER INSERT ON telemetry_events
  FOR EACH ROW EXECUTE FUNCTION kortyx_dirty_eval_billing();
