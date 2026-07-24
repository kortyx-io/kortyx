ALTER TABLE "workflow_revisions"
  ADD COLUMN IF NOT EXISTS "workflow_transitions" jsonb DEFAULT '[]'::jsonb NOT NULL;
