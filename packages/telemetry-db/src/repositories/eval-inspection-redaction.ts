import { type SQL, sql } from "drizzle-orm";

/** Redact before slicing: a continuation must never reveal the tail of a secret. */
export const evalEvidenceText = (value: SQL) => sql<string>`(WITH RECURSIVE
  walk(path, value, sensitive) AS (
    SELECT ARRAY[]::text[], ${value}, false
    UNION ALL
    SELECT path || child.key, child.value,
      child.key ~* '(password|secret|authorization|cookie|api.?key|credential|resume.?token|access.?token|refresh.?token|bearer.?token|session.?token|auth.?token)'
    FROM walk CROSS JOIN LATERAL (
      SELECT key, value FROM jsonb_each(CASE WHEN jsonb_typeof(walk.value)='object' THEN walk.value ELSE '{}'::jsonb END)
      UNION ALL
      SELECT (ordinality-1)::text, value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.value)='array' THEN walk.value ELSE '[]'::jsonb END) WITH ORDINALITY
    ) child WHERE NOT sensitive
  ), paths AS (SELECT row_number() OVER () AS n, path FROM walk WHERE sensitive),
  redacted(n, value) AS (
    SELECT 0::bigint, ${value}
    UNION ALL
    SELECT paths.n, jsonb_set(redacted.value, paths.path, '"[REDACTED]"'::jsonb)
    FROM redacted JOIN paths ON paths.n=redacted.n+1
  ) SELECT regexp_replace(value::text, '(ktyx_(test|live)_[^[:space:]"<>]+|Bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*)', '[REDACTED]', 'gi')
    FROM redacted ORDER BY n DESC LIMIT 1)`;
