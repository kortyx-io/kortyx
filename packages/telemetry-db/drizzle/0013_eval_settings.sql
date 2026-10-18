ALTER TABLE "eval_runs" ADD COLUMN "issue" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "termination" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "eval_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL;