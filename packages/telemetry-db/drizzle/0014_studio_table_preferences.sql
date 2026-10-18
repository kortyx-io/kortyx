CREATE TABLE "studio_table_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_kind" text NOT NULL,
	"user_id" uuid,
	"table_id" text NOT NULL,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_table_preferences_owner_check" CHECK (("studio_table_preferences"."owner_kind" = 'project' AND "studio_table_preferences"."user_id" IS NULL) OR ("studio_table_preferences"."owner_kind" = 'user' AND "studio_table_preferences"."user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "studio_table_views" (
	"preference_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_table_preferences" ADD CONSTRAINT "studio_table_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_table_preferences" ADD CONSTRAINT "studio_table_preferences_organization_id_project_id_projects_organization_id_id_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_table_views" ADD CONSTRAINT "studio_table_views_preference_id_studio_table_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."studio_table_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_table_preferences_user_unique" ON "studio_table_preferences" USING btree ("organization_id","project_id","user_id","table_id") WHERE "studio_table_preferences"."owner_kind" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "studio_table_preferences_project_unique" ON "studio_table_preferences" USING btree ("organization_id","project_id","table_id") WHERE "studio_table_preferences"."owner_kind" = 'project';--> statement-breakpoint
CREATE UNIQUE INDEX "studio_table_views_preference_id_unique" ON "studio_table_views" USING btree ("preference_id","id");