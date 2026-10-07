CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"name" text NOT NULL,
	"request" jsonb NOT NULL,
	"request_hash" text NOT NULL,
	"idempotency_key" text,
	"requested_by" text NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "evaluation_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_project_tenant_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_runs_scope_id_unique" ON "evaluation_runs" USING btree ("organization_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_runs_idempotency_unique" ON "evaluation_runs" USING btree ("organization_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "evaluation_runs_scope_created_idx" ON "evaluation_runs" USING btree ("organization_id","project_id","created_at");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_evaluation_tenant_fk" FOREIGN KEY ("organization_id","project_id","evaluation_id") REFERENCES "public"."evaluation_runs"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_runs_evaluation_idx" ON "eval_runs" USING btree ("evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_evaluation_suite_unique" ON "eval_runs" USING btree ("evaluation_id","suite_id");