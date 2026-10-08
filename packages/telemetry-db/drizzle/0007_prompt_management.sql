CREATE TABLE "prompt_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt_id" uuid,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"latest_version" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"draft" jsonb,
	"draft_base" integer,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"version" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"require_test" boolean DEFAULT true NOT NULL,
	"required_suites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_reviews" integer DEFAULT 0 NOT NULL,
	"allow_exception" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"hash" text NOT NULL,
	"environment" text NOT NULL,
	"reviewer" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_transfer_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"bundle_hash" text NOT NULL,
	"plan" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"hash" text NOT NULL,
	"note" text NOT NULL,
	"author" text NOT NULL,
	"origin" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "prompt_activity_asset_idx" ON "prompt_activity" USING btree ("organization_id","project_id","prompt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_assets_scope_id_unique" ON "prompt_assets" USING btree ("organization_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_assets_key_unique" ON "prompt_assets" USING btree ("organization_id","project_id","key");--> statement-breakpoint
CREATE INDEX "prompt_assets_category_idx" ON "prompt_assets" USING btree ("organization_id","project_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_assignments_prompt_env_unique" ON "prompt_assignments" USING btree ("organization_id","project_id","prompt_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_categories_scope_id_unique" ON "prompt_categories" USING btree ("organization_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_categories_sibling_unique" ON "prompt_categories" USING btree ("organization_id","project_id",coalesce("parent_id"::text, ''),"name");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_groups_name_unique" ON "prompt_groups" USING btree ("organization_id","project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_policies_env_unique" ON "prompt_policies" USING btree ("organization_id","project_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_reviews_actor_unique" ON "prompt_reviews" USING btree ("organization_id","project_id","prompt_id","version","environment","reviewer");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_scope_version_unique" ON "prompt_versions" USING btree ("organization_id","project_id","prompt_id","version");--> statement-breakpoint
CREATE INDEX "prompt_versions_hash_idx" ON "prompt_versions" USING btree ("organization_id","project_id","prompt_id","hash");
--> statement-breakpoint
ALTER TABLE "prompt_activity" ADD CONSTRAINT "prompt_activity_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_assets" ADD CONSTRAINT "prompt_assets_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_assets" ADD CONSTRAINT "prompt_assets_category_fk" FOREIGN KEY ("organization_id","project_id","category_id") REFERENCES "public"."prompt_categories"("organization_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_assignments" ADD CONSTRAINT "prompt_assignments_version_fk" FOREIGN KEY ("organization_id","project_id","prompt_id","version") REFERENCES "public"."prompt_versions"("organization_id","project_id","prompt_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_categories" ADD CONSTRAINT "prompt_categories_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_groups" ADD CONSTRAINT "prompt_groups_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_policies" ADD CONSTRAINT "prompt_policies_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_reviews" ADD CONSTRAINT "prompt_reviews_version_fk" FOREIGN KEY ("organization_id","project_id","prompt_id","version") REFERENCES "public"."prompt_versions"("organization_id","project_id","prompt_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_transfer_plans" ADD CONSTRAINT "prompt_transfer_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_asset_fk" FOREIGN KEY ("organization_id","project_id","prompt_id") REFERENCES "public"."prompt_assets"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;