CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE "studio_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "run_id" text NOT NULL,
  "session_id" text,
  "status" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "duration_ms" bigint,
  "tokens" bigint,
  "cost" double precision,
  "environment" text NOT NULL,
  "provider" text,
  "model" text,
  "user_id" text,
  "tenant_id" text,
  "has_tool" boolean DEFAULT false NOT NULL,
  "workflow_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "workflow_versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "transition_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "path" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "models" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "search_text" text DEFAULT '' NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "studio_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "session_id" text NOT NULL,
  "status" text NOT NULL,
  "last_activity_at" timestamp with time zone NOT NULL,
  "duration_ms" bigint,
  "tokens" bigint,
  "cost" double precision,
  "run_count" bigint NOT NULL,
  "environment" text NOT NULL,
  "user_id" text,
  "tenant_id" text,
  "active_workflow_id" text,
  "active_version" text,
  "pending_interrupt_id" text,
  "has_error" boolean DEFAULT false NOT NULL,
  "has_interrupt" boolean DEFAULT false NOT NULL,
  "has_checkpoint" boolean DEFAULT false NOT NULL,
  "has_fork" boolean DEFAULT false NOT NULL,
  "workflow_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "models" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "search_text" text DEFAULT '' NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "studio_interrupts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "interrupt_id" text NOT NULL,
  "run_id" text NOT NULL,
  "session_id" text,
  "status" text NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "workflow_id" text NOT NULL,
  "node_id" text,
  "environment" text NOT NULL,
  "user_id" text,
  "tenant_id" text,
  "resolved_by" text,
  "resume_outcome" text,
  "has_error" boolean DEFAULT false NOT NULL,
  "search_text" text DEFAULT '' NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "studio_runs"
  ADD CONSTRAINT "studio_runs_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
ALTER TABLE "studio_sessions"
  ADD CONSTRAINT "studio_sessions_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
ALTER TABLE "studio_interrupts"
  ADD CONSTRAINT "studio_interrupts_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;

CREATE UNIQUE INDEX "studio_runs_org_project_run_unique" ON "studio_runs" ("organization_id", "project_id", "run_id");
CREATE INDEX "studio_runs_scope_started_idx" ON "studio_runs" ("organization_id", "project_id", "started_at", "run_id");
CREATE INDEX "studio_runs_scope_status_started_idx" ON "studio_runs" ("organization_id", "project_id", "status", "started_at");
CREATE INDEX "studio_runs_scope_environment_started_idx" ON "studio_runs" ("organization_id", "project_id", "environment", "started_at");
CREATE INDEX "studio_runs_scope_session_idx" ON "studio_runs" ("organization_id", "project_id", "session_id");
CREATE INDEX "studio_runs_workflow_ids_gin_idx" ON "studio_runs" USING gin ("workflow_ids");
CREATE INDEX "studio_runs_workflow_versions_gin_idx" ON "studio_runs" USING gin ("workflow_versions");
CREATE INDEX "studio_runs_transition_ids_gin_idx" ON "studio_runs" USING gin ("transition_ids");
CREATE INDEX "studio_runs_path_gin_idx" ON "studio_runs" USING gin ("path");
CREATE INDEX "studio_runs_models_gin_idx" ON "studio_runs" USING gin ("models");
CREATE INDEX "studio_runs_search_text_trgm_idx" ON "studio_runs" USING gin ("search_text" gin_trgm_ops);

CREATE UNIQUE INDEX "studio_sessions_org_project_session_unique" ON "studio_sessions" ("organization_id", "project_id", "session_id");
CREATE INDEX "studio_sessions_scope_activity_idx" ON "studio_sessions" ("organization_id", "project_id", "last_activity_at", "session_id");
CREATE INDEX "studio_sessions_scope_status_activity_idx" ON "studio_sessions" ("organization_id", "project_id", "status", "last_activity_at");
CREATE INDEX "studio_sessions_scope_environment_activity_idx" ON "studio_sessions" ("organization_id", "project_id", "environment", "last_activity_at");
CREATE INDEX "studio_sessions_workflow_ids_gin_idx" ON "studio_sessions" USING gin ("workflow_ids");
CREATE INDEX "studio_sessions_providers_gin_idx" ON "studio_sessions" USING gin ("providers");
CREATE INDEX "studio_sessions_models_gin_idx" ON "studio_sessions" USING gin ("models");
CREATE INDEX "studio_sessions_tags_gin_idx" ON "studio_sessions" USING gin ("tags");
CREATE INDEX "studio_sessions_search_text_trgm_idx" ON "studio_sessions" USING gin ("search_text" gin_trgm_ops);

CREATE UNIQUE INDEX "studio_interrupts_org_project_interrupt_unique" ON "studio_interrupts" ("organization_id", "project_id", "interrupt_id");
CREATE INDEX "studio_interrupts_scope_created_idx" ON "studio_interrupts" ("organization_id", "project_id", "created_at", "interrupt_id");
CREATE INDEX "studio_interrupts_scope_status_created_idx" ON "studio_interrupts" ("organization_id", "project_id", "status", "created_at");
CREATE INDEX "studio_interrupts_scope_workflow_created_idx" ON "studio_interrupts" ("organization_id", "project_id", "workflow_id", "created_at");
CREATE INDEX "studio_interrupts_scope_run_idx" ON "studio_interrupts" ("organization_id", "project_id", "run_id");
CREATE INDEX "studio_interrupts_search_text_trgm_idx" ON "studio_interrupts" USING gin ("search_text" gin_trgm_ops);
