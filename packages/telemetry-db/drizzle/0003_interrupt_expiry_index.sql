CREATE INDEX IF NOT EXISTS "studio_interrupts_scope_status_expires_idx"
  ON "studio_interrupts" ("organization_id", "project_id", "status", "expires_at");
