-- Cache invalidation can run inside a capability function whose caller has a
-- restricted search_path. Resolve only PostgreSQL builtins and the product schema.
ALTER FUNCTION public.kortyx_invalidate_eval_progress() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.kortyx_dirty_eval_billing() SET search_path = pg_catalog, public;
