CREATE TABLE "eval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "environment" text NOT NULL,
  "target_id" text NOT NULL,
  "target_name" text NOT NULL,
  "suite_id" text NOT NULL,
  "suite_revision" text NOT NULL,
  "suite" jsonb NOT NULL,
  "request" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "result" jsonb,
  "error" text,
  "requested_by" text NOT NULL,
  "cancel_requested_at" timestamptz,
  "lease_owner" text,
  "lease_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "ended_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "eval_runs_project_tenant_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects" ("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "eval_runs_status_check" CHECK ("status" IN ('queued','running','passed','failed','error','cancelled'))
);
CREATE UNIQUE INDEX "eval_runs_scope_id_unique" ON "eval_runs" ("organization_id", "project_id", "id");
CREATE INDEX "eval_runs_scope_created_idx" ON "eval_runs" ("organization_id", "project_id", "created_at");
CREATE INDEX "eval_runs_queue_idx" ON "eval_runs" ("status", "created_at");
CREATE TABLE "eval_run_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "event" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "eval_run_events_tenant_fk" FOREIGN KEY ("organization_id", "project_id", "run_id") REFERENCES "eval_runs" ("organization_id", "project_id", "id") ON DELETE CASCADE
);
CREATE INDEX "eval_run_events_run_idx" ON "eval_run_events" ("organization_id", "project_id", "run_id", "id");
