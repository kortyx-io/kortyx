CREATE TABLE "judge_score_group_versions" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_score_groups" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_version" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"draft" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "judge_previews" ADD COLUMN "score_result" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "judge_score_group_versions_identity" ON "judge_score_group_versions" USING btree ("organization_id","project_id","group_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "judge_score_groups_scope_id" ON "judge_score_groups" USING btree ("organization_id","project_id","id");--> statement-breakpoint
ALTER TABLE "judge_score_group_versions" ADD CONSTRAINT "judge_score_group_versions_group_fk" FOREIGN KEY ("organization_id","project_id","group_id") REFERENCES "public"."judge_score_groups"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_score_groups" ADD CONSTRAINT "judge_score_groups_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;