CREATE TABLE "diagnostic_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_diagnostic_parts" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"diagnostic_record_id" uuid NOT NULL,
	"part_index" integer NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"content" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnostic_access" ADD CONSTRAINT "diagnostic_access_project_tenant_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "error_diagnostics_scope_id_unique" ON "error_diagnostics" USING btree ("organization_id","project_id","id");--> statement-breakpoint
ALTER TABLE "error_diagnostic_parts" ADD CONSTRAINT "error_diagnostic_parts_tenant_fk" FOREIGN KEY ("organization_id","project_id","diagnostic_record_id") REFERENCES "public"."error_diagnostics"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_diagnostics" ADD CONSTRAINT "error_diagnostics_project_tenant_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnostic_access_scope_idx" ON "diagnostic_access" USING btree ("organization_id","project_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "error_diagnostic_parts_identity_unique" ON "error_diagnostic_parts" USING btree ("diagnostic_record_id","part_index");--> statement-breakpoint
CREATE UNIQUE INDEX "error_diagnostics_scope_identity_unique" ON "error_diagnostics" USING btree ("organization_id","project_id","environment","diagnostic_id");--> statement-breakpoint
CREATE INDEX "error_diagnostics_expiry_idx" ON "error_diagnostics" USING btree ("expires_at");