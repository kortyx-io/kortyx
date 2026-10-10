ALTER TABLE "prompt_policies" DROP CONSTRAINT "prompt_policies_project_fk";
--> statement-breakpoint
DROP INDEX "prompt_policies_project_unique";--> statement-breakpoint
ALTER TABLE "prompt_policies" ADD COLUMN "prompt_id" uuid;--> statement-breakpoint
-- Preserve each existing prompt's effective policy before making it independent.
-- Audit the original rows, including projects without any prompt assets.
INSERT INTO prompt_activity (organization_id, project_id, action, actor, details)
SELECT organization_id, project_id, 'migrate-prompt-policy-scope', 'system:migration', to_jsonb(p)
FROM prompt_policies p;
--> statement-breakpoint
INSERT INTO prompt_policies (organization_id, project_id, prompt_id, revision, require_test, required_suites, required_reviews, allow_exception)
SELECT p.organization_id, p.project_id, a.id, p.revision, p.require_test, p.required_suites, p.required_reviews, p.allow_exception
FROM prompt_policies p
JOIN prompt_assets a ON a.organization_id = p.organization_id AND a.project_id = p.project_id
WHERE p.prompt_id IS NULL;
--> statement-breakpoint
DELETE FROM prompt_policies WHERE prompt_id IS NULL;
--> statement-breakpoint
ALTER TABLE "prompt_policies" ALTER COLUMN "prompt_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "prompt_policies" ADD CONSTRAINT "prompt_policies_asset_fk" FOREIGN KEY ("organization_id","project_id","prompt_id") REFERENCES "public"."prompt_assets"("organization_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_policies_prompt_unique" ON "prompt_policies" USING btree ("organization_id","project_id","prompt_id");