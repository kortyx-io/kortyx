ALTER TABLE "telemetry_scores" DROP CONSTRAINT "telemetry_scores_run_tenant_fk";
--> statement-breakpoint
DROP INDEX "studio_interrupts_org_project_interrupt_unique";--> statement-breakpoint
DROP INDEX "studio_runs_org_project_run_unique";--> statement-breakpoint
DROP INDEX "studio_sessions_org_project_session_unique";--> statement-breakpoint
DROP INDEX "telemetry_events_org_project_event_id_unique";--> statement-breakpoint
DROP INDEX "telemetry_scores_actor_target_name_unique";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "project_environments" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "project_environments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "project_environments_scope_id_unique" ON "project_environments" USING btree ("organization_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_interrupts_org_project_interrupt_unique" ON "studio_interrupts" USING btree ("organization_id","project_id","environment","interrupt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_runs_org_project_run_unique" ON "studio_runs" USING btree ("organization_id","project_id","environment","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_sessions_org_project_session_unique" ON "studio_sessions" USING btree ("organization_id","project_id","environment","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telemetry_events_org_project_event_id_unique" ON "telemetry_events" USING btree ("organization_id","project_id","environment","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telemetry_scores_actor_target_name_unique" ON "telemetry_scores" USING btree ("organization_id","project_id","environment","run_id","source","actor_id","name");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_environment_tenant_fk" FOREIGN KEY ("organization_id","project_id","environment_id") REFERENCES "public"."project_environments"("organization_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_scores" ADD CONSTRAINT "telemetry_scores_run_tenant_fk" FOREIGN KEY ("organization_id","project_id","environment","run_id") REFERENCES "public"."studio_runs"("organization_id","project_id","environment","run_id") ON DELETE cascade ON UPDATE no action;
