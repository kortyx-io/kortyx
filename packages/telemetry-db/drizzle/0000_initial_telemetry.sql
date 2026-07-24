CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "avatar_url" text,
  "email_verified_at" timestamp with time zone,
  "disabled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "auth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "email" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "organization_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_memberships_role_check" CHECK ("role" IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE TABLE "organization_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" text NOT NULL,
  "invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "accepted_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_invitations_role_check" CHECK ("role" IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "project_environments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "api_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "mode" text NOT NULL,
  "name" text NOT NULL,
  "secret_hash" text NOT NULL,
  "scopes" jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "model_rate_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "project_id" uuid,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "modality" text DEFAULT 'text' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "unit_prices" jsonb NOT NULL,
  "source" text NOT NULL,
  "pricing_ref" text,
  "metadata" jsonb,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "model_rate_cards_scope_check" CHECK (
    ("organization_id" IS NULL AND "project_id" IS NULL)
    OR ("organization_id" IS NOT NULL AND "project_id" IS NOT NULL)
  )
);

CREATE TABLE "workflow_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "environment" text NOT NULL,
  "workflow_id" text NOT NULL,
  "declared_version" text NOT NULL,
  "topology_hash" text NOT NULL,
  "service_name" text NOT NULL,
  "deployment_ref" text,
  "description" text,
  "tags" jsonb,
  "nodes" jsonb NOT NULL,
  "edges" jsonb NOT NULL,
  "workflow_transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "telemetry_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "event_id" text NOT NULL,
  "schema_version" integer NOT NULL,
  "type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "environment" text NOT NULL,
  "service_name" text NOT NULL,
  "deployment_ref" text,
  "trace_id" text,
  "span_id" text,
  "parent_span_id" text,
  "run_id" text NOT NULL,
  "session_id" text,
  "workflow_id" text NOT NULL,
  "workflow_revision_id" uuid,
  "topology_hash" text,
  "node_id" text,
  "user_id" text,
  "tenant_id" text,
  "context_tags" jsonb,
  "context_metadata" jsonb,
  "payload" jsonb NOT NULL
);

CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower("email"));
CREATE INDEX "users_disabled_at_idx" ON "users" ("disabled_at");

CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" ("user_id");
CREATE INDEX "auth_accounts_provider_email_idx" ON "auth_accounts" ("provider", "email");
CREATE UNIQUE INDEX "auth_accounts_provider_account_unique" ON "auth_accounts" ("provider", "provider_account_id");

CREATE UNIQUE INDEX "organization_memberships_org_user_unique" ON "organization_memberships" ("organization_id", "user_id");
CREATE INDEX "organization_memberships_user_org_idx" ON "organization_memberships" ("user_id", "organization_id");
CREATE INDEX "organization_memberships_org_role_idx" ON "organization_memberships" ("organization_id", "role");

CREATE UNIQUE INDEX "organization_invitations_token_hash_unique" ON "organization_invitations" ("token_hash");
CREATE UNIQUE INDEX "organization_invitations_active_email_unique" ON "organization_invitations" ("organization_id", lower("email")) WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
CREATE INDEX "organization_invitations_org_email_idx" ON "organization_invitations" ("organization_id", "email");
CREATE INDEX "organization_invitations_expires_at_idx" ON "organization_invitations" ("expires_at");
CREATE INDEX "organization_invitations_invited_by_user_id_idx" ON "organization_invitations" ("invited_by_user_id");

CREATE INDEX "projects_organization_id_idx" ON "projects" ("organization_id");
CREATE UNIQUE INDEX "projects_organization_id_id_unique" ON "projects" ("organization_id", "id");
CREATE UNIQUE INDEX "projects_organization_id_name_unique" ON "projects" ("organization_id", "name");

ALTER TABLE "project_environments"
  ADD CONSTRAINT "project_environments_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
CREATE INDEX "project_environments_org_project_idx" ON "project_environments" ("organization_id", "project_id");
CREATE UNIQUE INDEX "project_environments_org_project_name_unique" ON "project_environments" ("organization_id", "project_id", "name");

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
CREATE INDEX "api_keys_org_project_idx" ON "api_keys" ("organization_id", "project_id");
CREATE INDEX "api_keys_enabled_idx" ON "api_keys" ("enabled");

ALTER TABLE "model_rate_cards"
  ADD CONSTRAINT "model_rate_cards_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
CREATE INDEX "model_rate_cards_org_project_provider_model_idx" ON "model_rate_cards" ("organization_id", "project_id", "provider", "model");
CREATE INDEX "model_rate_cards_provider_model_idx" ON "model_rate_cards" ("provider", "model");
CREATE UNIQUE INDEX "model_rate_cards_default_identity_unique" ON "model_rate_cards" ("provider", "model", "source", "pricing_ref", "effective_from") WHERE "organization_id" IS NULL AND "project_id" IS NULL;
CREATE UNIQUE INDEX "model_rate_cards_project_identity_unique" ON "model_rate_cards" ("organization_id", "project_id", "provider", "model", "source", "pricing_ref", "effective_from") WHERE "organization_id" IS NOT NULL AND "project_id" IS NOT NULL;
CREATE INDEX "model_rate_cards_effective_idx" ON "model_rate_cards" ("effective_from", "effective_to");

ALTER TABLE "workflow_revisions"
  ADD CONSTRAINT "workflow_revisions_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
CREATE UNIQUE INDEX "workflow_revisions_org_project_id_unique" ON "workflow_revisions" ("organization_id", "project_id", "id");
CREATE INDEX "workflow_revisions_org_project_environment_idx" ON "workflow_revisions" ("organization_id", "project_id", "environment");
CREATE INDEX "workflow_revisions_org_project_workflow_idx" ON "workflow_revisions" ("organization_id", "project_id", "workflow_id");
CREATE UNIQUE INDEX "workflow_revisions_identity_unique" ON "workflow_revisions" ("organization_id", "project_id", "environment", "workflow_id", "topology_hash");

ALTER TABLE "telemetry_events"
  ADD CONSTRAINT "telemetry_events_project_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id")
  REFERENCES "projects"("organization_id", "id")
  ON DELETE cascade;
ALTER TABLE "telemetry_events"
  ADD CONSTRAINT "telemetry_events_workflow_revision_tenant_fk"
  FOREIGN KEY ("organization_id", "project_id", "workflow_revision_id")
  REFERENCES "workflow_revisions"("organization_id", "project_id", "id");
CREATE UNIQUE INDEX "telemetry_events_org_project_event_id_unique" ON "telemetry_events" ("organization_id", "project_id", "event_id");
CREATE INDEX "telemetry_events_org_project_occurred_at_idx" ON "telemetry_events" ("organization_id", "project_id", "occurred_at");
CREATE INDEX "telemetry_events_org_project_run_occurred_idx" ON "telemetry_events" ("organization_id", "project_id", "run_id", "occurred_at");
CREATE INDEX "telemetry_events_org_project_session_occurred_idx" ON "telemetry_events" ("organization_id", "project_id", "session_id", "occurred_at");
CREATE INDEX "telemetry_events_org_project_workflow_occurred_idx" ON "telemetry_events" ("organization_id", "project_id", "workflow_id", "occurred_at");
CREATE INDEX "telemetry_events_org_project_type_occurred_idx" ON "telemetry_events" ("organization_id", "project_id", "type", "occurred_at");
CREATE INDEX "telemetry_events_org_project_tenant_occurred_idx" ON "telemetry_events" ("organization_id", "project_id", "tenant_id", "occurred_at");
CREATE INDEX "telemetry_events_workflow_revision_id_idx" ON "telemetry_events" ("workflow_revision_id");
