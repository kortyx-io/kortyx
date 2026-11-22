-- Keep existing foreign keys in place and give PostgreSQL-truncated names
-- stable identifiers that match the Drizzle schema and snapshot.
ALTER TABLE "evaluator_dataset_bindings" RENAME CONSTRAINT "evaluator_dataset_bindings_organization_id_project_id_evaluator" TO "evaluator_dataset_bindings_version_fk";
--> statement-breakpoint
ALTER TABLE "evaluator_definitions" RENAME CONSTRAINT "evaluator_definitions_organization_id_project_id_projects_organ" TO "evaluator_definitions_project_fk";
--> statement-breakpoint
ALTER TABLE "evaluator_executions" RENAME CONSTRAINT "evaluator_executions_organization_id_project_id_evaluator_id_ev" TO "evaluator_executions_definition_fk";
--> statement-breakpoint
ALTER TABLE "evaluator_rules" RENAME CONSTRAINT "evaluator_rules_organization_id_project_id_evaluator_id_evaluat" TO "evaluator_rules_definition_fk";
--> statement-breakpoint
ALTER TABLE "evaluator_score_groups" RENAME CONSTRAINT "evaluator_score_groups_organization_id_project_id_projects_orga" TO "evaluator_score_groups_project_fk";
--> statement-breakpoint
ALTER TABLE "evaluator_versions" RENAME CONSTRAINT "evaluator_versions_organization_id_project_id_evaluator_id_eval" TO "evaluator_versions_definition_fk";
