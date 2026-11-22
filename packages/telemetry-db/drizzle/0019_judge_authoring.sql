CREATE TABLE "dataset_judge_bindings" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"judge_id" uuid NOT NULL,
	"judge_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_definitions" (
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
CREATE TABLE "judge_previews" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_id" uuid NOT NULL,
	"judge_version" integer NOT NULL,
	"environment" text NOT NULL,
	"target" jsonb NOT NULL,
	"source" text DEFAULT 'preview' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"rendered_messages" jsonb NOT NULL,
	"verdict" jsonb,
	"usage" jsonb,
	"error" text,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "judge_versions" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_judge_binding_identity" ON "dataset_judge_bindings" USING btree ("organization_id","project_id","target_id","suite_id","judge_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "judge_definitions_scope_id" ON "judge_definitions" USING btree ("organization_id","project_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "judge_preview_request" ON "judge_previews" USING btree ("organization_id","project_id","request_key");
--> statement-breakpoint
CREATE INDEX "judge_preview_queue" ON "judge_previews" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "judge_versions_identity" ON "judge_versions" USING btree ("organization_id","project_id","judge_id","version");
--> statement-breakpoint
ALTER TABLE "dataset_judge_bindings" ADD CONSTRAINT "dataset_judge_bindings_version_fk" FOREIGN KEY ("organization_id","project_id","judge_id","judge_version") REFERENCES "public"."judge_versions"("organization_id","project_id","judge_id","version") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "judge_definitions" ADD CONSTRAINT "judge_definitions_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "judge_previews" ADD CONSTRAINT "judge_previews_definition_fk" FOREIGN KEY ("organization_id","project_id","judge_id") REFERENCES "public"."judge_definitions"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "judge_versions" ADD CONSTRAINT "judge_versions_definition_fk" FOREIGN KEY ("organization_id","project_id","judge_id") REFERENCES "public"."judge_definitions"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Import earlier review assets as owned drafts. Existing managed Prompts,
-- published wrapper versions, recordings and dataset defaults remain intact.
-- These drafts have no association with the ordinary Prompts library.
INSERT INTO judge_definitions (id,organization_id,project_id,revision,published_version,archived,draft,updated_at)
SELECT d.id,d.organization_id,d.project_id,1,0,d.archived,
 jsonb_build_object(
  'name', d.draft->>'name', 'description', coalesce(d.draft->>'description',''),
  'model',d.draft->>'model','evidence',coalesce(d.draft->>'evidence','trajectory'),
  'content',jsonb_build_object(
   'instructions',coalesce(nullif((SELECT string_agg(message->>'content', E'\n\n' ORDER BY ordinal) FROM jsonb_array_elements(p.content->'messages') WITH ORDINALITY AS m(message,ordinal) WHERE message->>'role'='system'),''),'Assess the recorded response using available evidence. Explain missing evidence.'),
   'context', E'Criterion: {{criterion}}\nInput: {{input}}\nCurrent observation: {{observation}}\nReference facts: {{reference}}\nPreceding conversation: {{conversation}}'
  )
 ),d.updated_at
FROM evaluator_definitions d
LEFT JOIN prompt_versions p ON p.organization_id=d.organization_id AND p.project_id=d.project_id AND p.prompt_id=(d.draft->'prompt'->>'id')::uuid AND p.version=(d.draft->'prompt'->>'version')::integer
ON CONFLICT DO NOTHING;
