CREATE TABLE "telemetry_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "run_id" text NOT NULL,
  "environment" text NOT NULL,
  "name" text NOT NULL,
  "data_type" text NOT NULL,
  "value" jsonb NOT NULL,
  "source" text NOT NULL,
  "actor_id" text NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "telemetry_scores_run_tenant_fk" FOREIGN KEY ("organization_id", "project_id", "run_id")
    REFERENCES "studio_runs" ("organization_id", "project_id", "run_id") ON DELETE CASCADE,
  CONSTRAINT "telemetry_scores_source_check" CHECK ("source" IN ('end-user', 'human-review', 'evaluator')),
  CONSTRAINT "telemetry_scores_value_check" CHECK (
    ("data_type" = 'BOOLEAN' AND "value" IN ('0'::jsonb, '1'::jsonb)) OR
    ("data_type" = 'CATEGORICAL' AND jsonb_typeof("value") = 'string') OR
    ("data_type" = 'NUMERIC' AND jsonb_typeof("value") = 'number')
  )
);
CREATE UNIQUE INDEX "telemetry_scores_actor_target_name_unique"
  ON "telemetry_scores" ("organization_id", "project_id", "run_id", "source", "actor_id", "name");
CREATE INDEX "telemetry_scores_run_feedback_idx"
  ON "telemetry_scores" ("organization_id", "project_id", "run_id", "source", "name");
