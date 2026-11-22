CREATE TABLE "evaluator_dataset_bindings" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"evaluator_version" integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE "evaluator_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_version" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"draft" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "evaluator_executions" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"evaluator_version" integer NOT NULL,
	"environment" text NOT NULL,
	"target" jsonb NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"rule_id" uuid,
	"snapshot" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"rendered_messages" jsonb NOT NULL,
	"scores" jsonb,
	"usage" jsonb,
	"error" text,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE "evaluator_rules" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "evaluator_score_groups" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "evaluator_versions" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "evaluator_dataset_binding_identity" ON "evaluator_dataset_bindings" USING btree ("organization_id","project_id","target_id","suite_id","evaluator_id");--> statement-breakpoint

CREATE UNIQUE INDEX "evaluator_definitions_scope_id" ON "evaluator_definitions" USING btree ("organization_id","project_id","id");--> statement-breakpoint

CREATE UNIQUE INDEX "evaluator_execution_request" ON "evaluator_executions" USING btree ("organization_id","project_id","request_key");--> statement-breakpoint

CREATE INDEX "evaluator_execution_queue" ON "evaluator_executions" USING btree ("status","created_at");--> statement-breakpoint

CREATE UNIQUE INDEX "evaluator_score_groups_identity" ON "evaluator_score_groups" USING btree ("organization_id","project_id","id","version");--> statement-breakpoint

CREATE UNIQUE INDEX "evaluator_versions_identity" ON "evaluator_versions" USING btree ("organization_id","project_id","evaluator_id","version");--> statement-breakpoint

ALTER TABLE "evaluator_dataset_bindings" ADD CONSTRAINT "evaluator_dataset_bindings_organization_id_project_id_evaluator_id_evaluator_version_evaluator_versions_organization_id_project_id_evaluator_id_version_fk" FOREIGN KEY ("organization_id","project_id","evaluator_id","evaluator_version") REFERENCES "public"."evaluator_versions"("organization_id","project_id","evaluator_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "evaluator_definitions" ADD CONSTRAINT "evaluator_definitions_organization_id_project_id_projects_organization_id_id_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "evaluator_executions" ADD CONSTRAINT "evaluator_executions_organization_id_project_id_evaluator_id_evaluator_definitions_organization_id_project_id_id_fk" FOREIGN KEY ("organization_id","project_id","evaluator_id") REFERENCES "public"."evaluator_definitions"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "evaluator_rules" ADD CONSTRAINT "evaluator_rules_organization_id_project_id_evaluator_id_evaluator_definitions_organization_id_project_id_id_fk" FOREIGN KEY ("organization_id","project_id","evaluator_id") REFERENCES "public"."evaluator_definitions"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "evaluator_score_groups" ADD CONSTRAINT "evaluator_score_groups_organization_id_project_id_projects_organization_id_id_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "evaluator_versions" ADD CONSTRAINT "evaluator_versions_organization_id_project_id_evaluator_id_evaluator_definitions_organization_id_project_id_id_fk" FOREIGN KEY ("organization_id","project_id","evaluator_id") REFERENCES "public"."evaluator_definitions"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;
