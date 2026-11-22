ALTER TABLE "eval_runs" ADD COLUMN "evaluator_snapshots" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "evaluators_scheduled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluator_rules" ADD COLUMN "scan_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evaluator_rules" ADD COLUMN "scan_id" uuid;