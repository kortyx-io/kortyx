// Released migrations are immutable. Add a new numbered migration for schema changes.
export const initialRuntimeMigration = Object.freeze({
  version: 1,
  description: "Initial runtime persistence tables",
  sql: `
CREATE TABLE IF NOT EXISTS kortyx_runtime_sessions (
  scope text NOT NULL, id text NOT NULL, head_id text,
  last_activity bigint NOT NULL, next_turn bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, id)
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_sessions_activity
  ON kortyx_runtime_sessions (scope, last_activity);
CREATE TABLE IF NOT EXISTS kortyx_runtime_runs (
  scope text NOT NULL, id text NOT NULL, session_id text,
  last_activity bigint NOT NULL, revision bigint NOT NULL DEFAULT 0,
  lease_token text, lease_until bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, id)
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_runs_activity
  ON kortyx_runtime_runs (scope, last_activity);
CREATE INDEX IF NOT EXISTS kortyx_runtime_runs_session
  ON kortyx_runtime_runs (scope, session_id);
CREATE TABLE IF NOT EXISTS kortyx_runtime_graph_checkpoints (
  scope text NOT NULL, run_id text NOT NULL, ns text NOT NULL, id text NOT NULL,
  position bigserial NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (scope, run_id, ns, id),
  FOREIGN KEY (scope, run_id) REFERENCES kortyx_runtime_runs (scope, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_graph_latest
  ON kortyx_runtime_graph_checkpoints (scope, run_id, ns, position DESC);
CREATE TABLE IF NOT EXISTS kortyx_runtime_graph_writes (
  scope text NOT NULL, run_id text NOT NULL, ns text NOT NULL, checkpoint_id text NOT NULL,
  task_id text NOT NULL, idx integer NOT NULL, channel text NOT NULL, value jsonb NOT NULL,
  PRIMARY KEY (scope, run_id, ns, checkpoint_id, task_id, idx),
  FOREIGN KEY (scope, run_id, ns, checkpoint_id)
    REFERENCES kortyx_runtime_graph_checkpoints (scope, run_id, ns, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS kortyx_runtime_session_checkpoints (
  scope text NOT NULL, id text NOT NULL, session_id text NOT NULL, run_id text NOT NULL,
  created_at bigint NOT NULL, turn_index bigint NOT NULL, active boolean NOT NULL DEFAULT true,
  record jsonb NOT NULL,
  PRIMARY KEY (scope, id),
  FOREIGN KEY (scope, session_id) REFERENCES kortyx_runtime_sessions (scope, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_session_history
  ON kortyx_runtime_session_checkpoints (scope, session_id, turn_index);
CREATE INDEX IF NOT EXISTS kortyx_runtime_session_runs
  ON kortyx_runtime_session_checkpoints (scope, run_id);
CREATE INDEX IF NOT EXISTS kortyx_runtime_checkpoint_age
  ON kortyx_runtime_session_checkpoints (scope, created_at);
CREATE TABLE IF NOT EXISTS kortyx_runtime_pending_requests (
  scope text NOT NULL, token text NOT NULL, run_id text NOT NULL, session_id text,
  expires_at bigint NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (scope, token)
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_pending_expiry
  ON kortyx_runtime_pending_requests (scope, expires_at);
CREATE INDEX IF NOT EXISTS kortyx_runtime_pending_runs
  ON kortyx_runtime_pending_requests (scope, run_id);
CREATE INDEX IF NOT EXISTS kortyx_runtime_pending_sessions
  ON kortyx_runtime_pending_requests (scope, session_id);
`,
});
