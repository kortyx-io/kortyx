ALTER TABLE "prompt_assignments" RENAME COLUMN "environment" TO "tag";--> statement-breakpoint
DROP INDEX "prompt_assignments_prompt_env_unique";--> statement-breakpoint
DROP INDEX "prompt_policies_env_unique";--> statement-breakpoint
DROP INDEX "prompt_reviews_actor_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_assignments_prompt_tag_unique" ON "prompt_assignments" USING btree ("organization_id","project_id","prompt_id","tag");--> statement-breakpoint
-- Retain the previous project policies and reviews in the audit log before
-- consolidating their environment-specific records into project-level records.
INSERT INTO prompt_activity (organization_id, project_id, action, actor, details)
SELECT organization_id, project_id, 'migrate-prompt-policy', 'system:migration', to_jsonb(p) FROM prompt_policies p;
--> statement-breakpoint
DELETE FROM prompt_policies WHERE id IN (
  SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY organization_id, project_id ORDER BY (environment = 'production') DESC, revision DESC, id) AS n FROM prompt_policies) ranked WHERE n > 1
);
--> statement-breakpoint
INSERT INTO prompt_activity (organization_id, project_id, prompt_id, action, actor, details)
SELECT organization_id, project_id, prompt_id, 'migrate-prompt-review', 'system:migration', to_jsonb(r) FROM prompt_reviews r;
--> statement-breakpoint
DELETE FROM prompt_reviews WHERE id IN (
  SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY organization_id, project_id, prompt_id, version, reviewer ORDER BY created_at DESC, id) AS n FROM prompt_reviews) ranked WHERE n > 1
);
--> statement-breakpoint
-- Preserve existing named assignments as optional tags. The former production
-- assignment becomes the initial live version; saving versions never moves it.
INSERT INTO prompt_assignments (organization_id, project_id, prompt_id, tag, version, revision, updated_at)
SELECT organization_id, project_id, prompt_id, 'live', version, revision, updated_at FROM prompt_assignments WHERE tag = 'production'
ON CONFLICT (organization_id, project_id, prompt_id, tag) DO NOTHING;
--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_policies_project_unique" ON "prompt_policies" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_reviews_actor_unique" ON "prompt_reviews" USING btree ("organization_id","project_id","prompt_id","version","reviewer");--> statement-breakpoint
ALTER TABLE "prompt_policies" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "prompt_reviews" DROP COLUMN "environment";