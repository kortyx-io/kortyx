import type {
  DiagnosticManifest,
  EnsureWorkflowTopologyRequest,
  KortyxTelemetryEvent,
  StudioInterrupt,
  StudioRun,
  StudioScore,
  StudioSession,
  TelemetryUnitPrice,
} from "@kortyx/telemetry-contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestampWithTimezone = (name: string) =>
  timestamp(name, { withTimezone: true });

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    emailVerifiedAt: timestampWithTimezone("email_verified_at"),
    disabledAt: timestampWithTimezone("disabled_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    index("users_disabled_at_idx").on(table.disabledAt),
  ],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "auth_accounts_user_id_fkey",
    }).onDelete("cascade"),
    index("auth_accounts_user_id_idx").on(table.userId),
    index("auth_accounts_provider_email_idx").on(table.provider, table.email),
    uniqueIndex("auth_accounts_provider_account_unique").on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "organization_memberships_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "organization_memberships_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "organization_memberships_role_check",
      sql`${table.role} in ('owner', 'admin', 'member', 'viewer')`,
    ),
    uniqueIndex("organization_memberships_org_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_memberships_user_org_idx").on(
      table.userId,
      table.organizationId,
    ),
    index("organization_memberships_org_role_idx").on(
      table.organizationId,
      table.role,
    ),
  ],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id"),
    acceptedByUserId: uuid("accepted_by_user_id"),
    expiresAt: timestampWithTimezone("expires_at").notNull(),
    acceptedAt: timestampWithTimezone("accepted_at"),
    revokedAt: timestampWithTimezone("revoked_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "organization_invitations_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invitedByUserId],
      foreignColumns: [users.id],
      name: "organization_invitations_invited_by_user_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.acceptedByUserId],
      foreignColumns: [users.id],
      name: "organization_invitations_accepted_by_user_id_fkey",
    }).onDelete("set null"),
    check(
      "organization_invitations_role_check",
      sql`${table.role} in ('owner', 'admin', 'member', 'viewer')`,
    ),
    uniqueIndex("organization_invitations_token_hash_unique").on(
      table.tokenHash,
    ),
    uniqueIndex("organization_invitations_active_email_unique")
      .on(table.organizationId, sql`lower(${table.email})`)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index("organization_invitations_org_email_idx").on(
      table.organizationId,
      table.email,
    ),
    index("organization_invitations_expires_at_idx").on(table.expiresAt),
    index("organization_invitations_invited_by_user_id_idx").on(
      table.invitedByUserId,
    ),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "projects_organization_id_fkey",
    }).onDelete("cascade"),
    index("projects_organization_id_idx").on(table.organizationId),
    uniqueIndex("projects_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("projects_organization_id_name_unique").on(
      table.organizationId,
      table.name,
    ),
  ],
);

export const projectEnvironments = pgTable(
  "project_environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    displayName: text("display_name"),
    archivedAt: timestampWithTimezone("archived_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "project_environments_project_tenant_fk",
    }).onDelete("cascade"),
    index("project_environments_org_project_idx").on(
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex("project_environments_org_project_name_unique").on(
      table.organizationId,
      table.projectId,
      table.name,
    ),
    uniqueIndex("project_environments_scope_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    // Optional for existing operator-managed installations; Cloud requires a binding.
    environmentId: uuid("environment_id"),
    mode: text("mode").notNull(),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastUsedAt: timestampWithTimezone("last_used_at"),
    expiresAt: timestampWithTimezone("expires_at"),
    revokedAt: timestampWithTimezone("revoked_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "api_keys_project_tenant_fk",
    }).onDelete("cascade"),
    index("api_keys_org_project_idx").on(table.organizationId, table.projectId),
    index("api_keys_enabled_idx").on(table.enabled),
    foreignKey({
      columns: [table.organizationId, table.projectId, table.environmentId],
      foreignColumns: [
        projectEnvironments.organizationId,
        projectEnvironments.projectId,
        projectEnvironments.id,
      ],
      name: "api_keys_environment_tenant_fk",
    }),
  ],
);

export const modelRateCards = pgTable(
  "model_rate_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    projectId: uuid("project_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    modality: text("modality").notNull().default("text"),
    currency: text("currency").notNull().default("USD"),
    unitPrices: jsonb("unit_prices").$type<TelemetryUnitPrice[]>().notNull(),
    source: text("source").notNull(),
    pricingRef: text("pricing_ref"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    effectiveFrom: timestampWithTimezone("effective_from")
      .notNull()
      .defaultNow(),
    effectiveTo: timestampWithTimezone("effective_to"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "model_rate_cards_project_tenant_fk",
    }).onDelete("cascade"),
    check(
      "model_rate_cards_scope_check",
      sql`(${table.organizationId} is null and ${table.projectId} is null) or (${table.organizationId} is not null and ${table.projectId} is not null)`,
    ),
    index("model_rate_cards_org_project_provider_model_idx").on(
      table.organizationId,
      table.projectId,
      table.provider,
      table.model,
    ),
    index("model_rate_cards_provider_model_idx").on(
      table.provider,
      table.model,
    ),
    uniqueIndex("model_rate_cards_default_identity_unique")
      .on(
        table.provider,
        table.model,
        table.source,
        table.pricingRef,
        table.effectiveFrom,
      )
      .where(
        sql`${table.organizationId} is null and ${table.projectId} is null`,
      ),
    uniqueIndex("model_rate_cards_project_identity_unique")
      .on(
        table.organizationId,
        table.projectId,
        table.provider,
        table.model,
        table.source,
        table.pricingRef,
        table.effectiveFrom,
      )
      .where(
        sql`${table.organizationId} is not null and ${table.projectId} is not null`,
      ),
    index("model_rate_cards_effective_idx").on(
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const workflowRevisions = pgTable(
  "workflow_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environment: text("environment").notNull(),
    workflowId: text("workflow_id").notNull(),
    declaredVersion: text("declared_version").notNull(),
    topologyHash: text("topology_hash").notNull(),
    serviceName: text("service_name").notNull(),
    deploymentRef: text("deployment_ref"),
    description: text("description"),
    tags: jsonb("tags").$type<string[]>(),
    nodes: jsonb("nodes")
      .$type<EnsureWorkflowTopologyRequest["workflow"]["nodes"]>()
      .notNull(),
    edges: jsonb("edges")
      .$type<EnsureWorkflowTopologyRequest["workflow"]["edges"]>()
      .notNull(),
    workflowTransitions: jsonb("workflow_transitions")
      .$type<
        NonNullable<EnsureWorkflowTopologyRequest["workflow"]["transitions"]>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "workflow_revisions_project_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("workflow_revisions_org_project_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    index("workflow_revisions_org_project_environment_idx").on(
      table.organizationId,
      table.projectId,
      table.environment,
    ),
    index("workflow_revisions_org_project_workflow_idx").on(
      table.organizationId,
      table.projectId,
      table.workflowId,
    ),
    uniqueIndex("workflow_revisions_identity_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.workflowId,
      table.topologyHash,
    ),
  ],
);

export const studioRuns = pgTable(
  "studio_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    runId: text("run_id").notNull(),
    sessionId: text("session_id"),
    status: text("status").notNull(),
    startedAt: timestampWithTimezone("started_at").notNull(),
    endedAt: timestampWithTimezone("ended_at"),
    durationMs: bigint("duration_ms", { mode: "number" }),
    tokens: bigint("tokens", { mode: "number" }),
    cost: doublePrecision("cost"),
    environment: text("environment").notNull(),
    provider: text("provider"),
    model: text("model"),
    userId: text("user_id"),
    tenantId: text("tenant_id"),
    hasTool: boolean("has_tool").notNull().default(false),
    workflowIds: jsonb("workflow_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    workflowVersions: jsonb("workflow_versions")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    transitionIds: jsonb("transition_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    path: jsonb("path").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    models: jsonb("models")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    searchText: text("search_text").notNull().default(""),
    data: jsonb("data").$type<StudioRun>().notNull(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "studio_runs_project_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("studio_runs_org_project_run_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.runId,
    ),
    index("studio_runs_scope_started_idx").on(
      table.organizationId,
      table.projectId,
      table.startedAt,
      table.runId,
    ),
    index("studio_runs_scope_status_started_idx").on(
      table.organizationId,
      table.projectId,
      table.status,
      table.startedAt,
    ),
    index("studio_runs_scope_environment_started_idx").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.startedAt,
    ),
    index("studio_runs_scope_session_idx").on(
      table.organizationId,
      table.projectId,
      table.sessionId,
    ),
    index("studio_runs_workflow_ids_gin_idx").using("gin", table.workflowIds),
    index("studio_runs_workflow_versions_gin_idx").using(
      "gin",
      table.workflowVersions,
    ),
    index("studio_runs_transition_ids_gin_idx").using(
      "gin",
      table.transitionIds,
    ),
    index("studio_runs_path_gin_idx").using("gin", table.path),
    index("studio_runs_models_gin_idx").using("gin", table.models),
    index("studio_runs_search_text_trgm_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
  ],
);

export const telemetryScores = pgTable(
  "telemetry_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    runId: text("run_id").notNull(),
    environment: text("environment").notNull(),
    name: text("name").notNull(),
    dataType: text("data_type").$type<StudioScore["dataType"]>().notNull(),
    value: jsonb("value").$type<StudioScore["value"]>().notNull(),
    source: text("source").$type<StudioScore["source"]>().notNull(),
    actorId: text("actor_id").notNull(),
    reasons: jsonb("reasons")
      .$type<StudioScore["reasons"]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    comment: text("comment"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.organizationId,
        table.projectId,
        table.environment,
        table.runId,
      ],
      foreignColumns: [
        studioRuns.organizationId,
        studioRuns.projectId,
        studioRuns.environment,
        studioRuns.runId,
      ],
      name: "telemetry_scores_run_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("telemetry_scores_actor_target_name_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.runId,
      table.source,
      table.actorId,
      table.name,
    ),
    index("telemetry_scores_run_feedback_idx").on(
      table.organizationId,
      table.projectId,
      table.runId,
      table.source,
      table.name,
    ),
    check(
      "telemetry_scores_source_check",
      sql`${table.source} in ('end-user', 'human-review', 'evaluator')`,
    ),
    check(
      "telemetry_scores_value_check",
      sql`(
      (${table.dataType} = 'BOOLEAN' and ${table.value} in ('0'::jsonb, '1'::jsonb)) or
      (${table.dataType} = 'CATEGORICAL' and jsonb_typeof(${table.value}) = 'string') or
      (${table.dataType} = 'NUMERIC' and jsonb_typeof(${table.value}) = 'number')
    )`,
    ),
  ],
);

export const studioSessions = pgTable(
  "studio_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    sessionId: text("session_id").notNull(),
    status: text("status").notNull(),
    lastActivityAt: timestampWithTimezone("last_activity_at").notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }),
    tokens: bigint("tokens", { mode: "number" }),
    cost: doublePrecision("cost"),
    runCount: bigint("run_count", { mode: "number" }).notNull(),
    environment: text("environment").notNull(),
    userId: text("user_id"),
    tenantId: text("tenant_id"),
    activeWorkflowId: text("active_workflow_id"),
    activeVersion: text("active_version"),
    pendingInterruptId: text("pending_interrupt_id"),
    hasError: boolean("has_error").notNull().default(false),
    hasInterrupt: boolean("has_interrupt").notNull().default(false),
    hasCheckpoint: boolean("has_checkpoint").notNull().default(false),
    hasFork: boolean("has_fork").notNull().default(false),
    workflowIds: jsonb("workflow_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    providers: jsonb("providers")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    models: jsonb("models")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    searchText: text("search_text").notNull().default(""),
    data: jsonb("data").$type<StudioSession>().notNull(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "studio_sessions_project_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("studio_sessions_org_project_session_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.sessionId,
    ),
    index("studio_sessions_scope_activity_idx").on(
      table.organizationId,
      table.projectId,
      table.lastActivityAt,
      table.sessionId,
    ),
    index("studio_sessions_scope_status_activity_idx").on(
      table.organizationId,
      table.projectId,
      table.status,
      table.lastActivityAt,
    ),
    index("studio_sessions_scope_environment_activity_idx").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.lastActivityAt,
    ),
    index("studio_sessions_workflow_ids_gin_idx").using(
      "gin",
      table.workflowIds,
    ),
    index("studio_sessions_providers_gin_idx").using("gin", table.providers),
    index("studio_sessions_models_gin_idx").using("gin", table.models),
    index("studio_sessions_tags_gin_idx").using("gin", table.tags),
    index("studio_sessions_search_text_trgm_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
  ],
);

export const studioInterrupts = pgTable(
  "studio_interrupts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    interruptId: text("interrupt_id").notNull(),
    runId: text("run_id").notNull(),
    sessionId: text("session_id"),
    status: text("status").notNull(),
    type: text("type").notNull(),
    createdAt: timestampWithTimezone("created_at").notNull(),
    resolvedAt: timestampWithTimezone("resolved_at"),
    expiresAt: timestampWithTimezone("expires_at"),
    workflowId: text("workflow_id").notNull(),
    nodeId: text("node_id"),
    environment: text("environment").notNull(),
    userId: text("user_id"),
    tenantId: text("tenant_id"),
    resolvedBy: text("resolved_by"),
    resumeOutcome: text("resume_outcome"),
    hasError: boolean("has_error").notNull().default(false),
    searchText: text("search_text").notNull().default(""),
    data: jsonb("data").$type<StudioInterrupt>().notNull(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "studio_interrupts_project_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("studio_interrupts_org_project_interrupt_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.interruptId,
    ),
    index("studio_interrupts_scope_created_idx").on(
      table.organizationId,
      table.projectId,
      table.createdAt,
      table.interruptId,
    ),
    index("studio_interrupts_scope_status_created_idx").on(
      table.organizationId,
      table.projectId,
      table.status,
      table.createdAt,
    ),
    index("studio_interrupts_scope_status_expires_idx").on(
      table.organizationId,
      table.projectId,
      table.status,
      table.expiresAt,
    ),
    index("studio_interrupts_scope_workflow_created_idx").on(
      table.organizationId,
      table.projectId,
      table.workflowId,
      table.createdAt,
    ),
    index("studio_interrupts_scope_run_idx").on(
      table.organizationId,
      table.projectId,
      table.runId,
    ),
    index("studio_interrupts_search_text_trgm_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
  ],
);

export const telemetryEvents = pgTable(
  "telemetry_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    eventId: text("event_id").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    type: text("type").notNull(),
    occurredAt: timestampWithTimezone("occurred_at").notNull(),
    receivedAt: timestampWithTimezone("received_at").notNull().defaultNow(),
    environment: text("environment").notNull(),
    serviceName: text("service_name").notNull(),
    deploymentRef: text("deployment_ref"),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    parentSpanId: text("parent_span_id"),
    runId: text("run_id").notNull(),
    sessionId: text("session_id"),
    workflowId: text("workflow_id").notNull(),
    workflowRevisionId: uuid("workflow_revision_id"),
    topologyHash: text("topology_hash"),
    nodeId: text("node_id"),
    userId: text("user_id"),
    tenantId: text("tenant_id"),
    contextTags: jsonb("context_tags").$type<string[]>(),
    contextMetadata: jsonb("context_metadata").$type<Record<string, unknown>>(),
    payload: jsonb("payload")
      .$type<KortyxTelemetryEvent["payload"]>()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "telemetry_events_project_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.projectId,
        table.workflowRevisionId,
      ],
      foreignColumns: [
        workflowRevisions.organizationId,
        workflowRevisions.projectId,
        workflowRevisions.id,
      ],
      name: "telemetry_events_workflow_revision_tenant_fk",
    }),
    uniqueIndex("telemetry_events_org_project_event_id_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.eventId,
    ),
    index("telemetry_events_org_project_occurred_at_idx").on(
      table.organizationId,
      table.projectId,
      table.occurredAt,
    ),
    index("telemetry_events_org_project_run_occurred_idx").on(
      table.organizationId,
      table.projectId,
      table.runId,
      table.occurredAt,
    ),
    index("telemetry_events_org_project_session_occurred_idx").on(
      table.organizationId,
      table.projectId,
      table.sessionId,
      table.occurredAt,
    ),
    index("telemetry_events_org_project_workflow_occurred_idx").on(
      table.organizationId,
      table.projectId,
      table.workflowId,
      table.occurredAt,
    ),
    index("telemetry_events_org_project_type_occurred_idx").on(
      table.organizationId,
      table.projectId,
      table.type,
      table.occurredAt,
    ),
    index("telemetry_events_org_project_tenant_occurred_idx").on(
      table.organizationId,
      table.projectId,
      table.tenantId,
      table.occurredAt,
    ),
    index("telemetry_events_workflow_revision_id_idx").on(
      table.workflowRevisionId,
    ),
  ],
);

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environment: text("environment").notNull(),
    targetId: text("target_id").notNull(),
    targetName: text("target_name").notNull(),
    name: text("name").notNull(),
    request: jsonb("request")
      .$type<import("@kortyx/agent/evals").StudioEvaluationStartRequest>()
      .notNull(),
    requestHash: text("request_hash").notNull(),
    idempotencyKey: text("idempotency_key"),
    requestedBy: text("requested_by").notNull(),
    cancelRequestedAt: timestampWithTimezone("cancel_requested_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "evaluation_runs_project_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("evaluation_runs_scope_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    uniqueIndex("evaluation_runs_idempotency_unique").on(
      table.organizationId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("evaluation_runs_scope_created_idx").on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    evaluationId: uuid("evaluation_id"),
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environment: text("environment").notNull(),
    targetId: text("target_id").notNull(),
    targetName: text("target_name").notNull(),
    suiteId: text("suite_id").notNull(),
    suiteRevision: text("suite_revision").notNull(),
    suite: jsonb("suite")
      .$type<import("@kortyx/agent/evals").EvalSuite>()
      .notNull(),
    request: jsonb("request")
      .$type<import("@kortyx/agent/evals").EvalRemoteRunRequest>()
      .notNull(),
    status: text("status")
      .$type<
        "queued" | "running" | "passed" | "failed" | "error" | "cancelled"
      >()
      .notNull()
      .default("queued"),
    result:
      jsonb("result").$type<import("@kortyx/agent/evals").EvalRunResult>(),
    error: text("error"),
    requestedBy: text("requested_by").notNull(),
    cancelRequestedAt: timestampWithTimezone("cancel_requested_at"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestampWithTimezone("lease_expires_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    startedAt: timestampWithTimezone("started_at"),
    endedAt: timestampWithTimezone("ended_at"),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "eval_runs_project_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.projectId, table.evaluationId],
      foreignColumns: [
        evaluationRuns.organizationId,
        evaluationRuns.projectId,
        evaluationRuns.id,
      ],
      name: "eval_runs_evaluation_tenant_fk",
    }).onDelete("cascade"),
    index("eval_runs_evaluation_idx").on(table.evaluationId),
    uniqueIndex("eval_runs_evaluation_suite_unique").on(
      table.evaluationId,
      table.suiteId,
    ),
    uniqueIndex("eval_runs_scope_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    index("eval_runs_scope_created_idx").on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
    index("eval_runs_queue_idx").on(table.status, table.createdAt),
    check(
      "eval_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'passed', 'failed', 'error', 'cancelled')`,
    ),
  ],
);
export const evalRunEvents = pgTable(
  "eval_run_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    runId: uuid("run_id").notNull(),
    event: jsonb("event")
      .$type<import("@kortyx/agent/evals").EvalProgress>()
      .notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId, table.runId],
      foreignColumns: [
        evalRuns.organizationId,
        evalRuns.projectId,
        evalRuns.id,
      ],
      name: "eval_run_events_tenant_fk",
    }).onDelete("cascade"),
    index("eval_run_events_run_idx").on(
      table.organizationId,
      table.projectId,
      table.runId,
      table.id,
    ),
  ],
);

const promptScopeColumns = () => ({
  organizationId: uuid("organization_id").notNull(),
  projectId: uuid("project_id").notNull(),
});
export const promptCategories = pgTable(
  "prompt_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "prompt_categories_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("prompt_categories_scope_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    uniqueIndex("prompt_categories_sibling_unique").on(
      table.organizationId,
      table.projectId,
      sql`coalesce(${table.parentId}::text, '')`,
      table.name,
    ),
  ],
);
export const promptAssets = pgTable(
  "prompt_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    categoryId: uuid("category_id"),
    latestVersion: integer("latest_version").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    draft: jsonb("draft").$type<import("@kortyx/prompts").PromptContent>(),
    draftBase: integer("draft_base"),
    draftRevision: integer("draft_revision").notNull().default(0),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "prompt_assets_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.projectId, table.categoryId],
      foreignColumns: [
        promptCategories.organizationId,
        promptCategories.projectId,
        promptCategories.id,
      ],
      name: "prompt_assets_category_fk",
    }),
    uniqueIndex("prompt_assets_scope_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    uniqueIndex("prompt_assets_key_unique").on(
      table.organizationId,
      table.projectId,
      table.key,
    ),
    index("prompt_assets_category_idx").on(
      table.organizationId,
      table.projectId,
      table.categoryId,
    ),
  ],
);
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    promptId: uuid("prompt_id").notNull(),
    version: integer("version").notNull(),
    content: jsonb("content")
      .$type<import("@kortyx/prompts").PromptContent>()
      .notNull(),
    hash: text("hash").notNull(),
    note: text("note").notNull(),
    author: text("author").notNull(),
    origin: jsonb("origin").$type<{
      apiUrl: string;
      projectId: string;
      key: string;
      version: number;
      hash: string;
    }>(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId, table.promptId],
      foreignColumns: [
        promptAssets.organizationId,
        promptAssets.projectId,
        promptAssets.id,
      ],
      name: "prompt_versions_asset_fk",
    }).onDelete("cascade"),
    uniqueIndex("prompt_versions_scope_version_unique").on(
      table.organizationId,
      table.projectId,
      table.promptId,
      table.version,
    ),
    index("prompt_versions_hash_idx").on(
      table.organizationId,
      table.projectId,
      table.promptId,
      table.hash,
    ),
  ],
);
export const promptAssignments = pgTable(
  "prompt_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    promptId: uuid("prompt_id").notNull(),
    tag: text("tag").notNull(),
    version: integer("version").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.organizationId,
        table.projectId,
        table.promptId,
        table.version,
      ],
      foreignColumns: [
        promptVersions.organizationId,
        promptVersions.projectId,
        promptVersions.promptId,
        promptVersions.version,
      ],
      name: "prompt_assignments_version_fk",
    }).onDelete("cascade"),
    uniqueIndex("prompt_assignments_prompt_tag_unique").on(
      table.organizationId,
      table.projectId,
      table.promptId,
      table.tag,
    ),
  ],
);
export const promptGroups = pgTable(
  "prompt_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    members: jsonb("members")
      .$type<{ promptId: string; version: number }[]>()
      .notNull()
      .default([]),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "prompt_groups_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("prompt_groups_name_unique").on(
      table.organizationId,
      table.projectId,
      table.name,
    ),
  ],
);
export const promptPolicies = pgTable(
  "prompt_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    promptId: uuid("prompt_id").notNull(),
    revision: integer("revision").notNull().default(1),
    requireTest: boolean("require_test").notNull().default(true),
    requireChangeNote: boolean("require_change_note").notNull().default(false),
    requiredSuites: jsonb("required_suites")
      .$type<{ targetId: string; suiteId: string }[]>()
      .notNull()
      .default([]),
    requiredReviews: integer("required_reviews").notNull().default(0),
    allowException: boolean("allow_exception").notNull().default(true),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId, table.promptId],
      foreignColumns: [
        promptAssets.organizationId,
        promptAssets.projectId,
        promptAssets.id,
      ],
      name: "prompt_policies_asset_fk",
    }).onDelete("cascade"),
    uniqueIndex("prompt_policies_prompt_unique").on(
      table.organizationId,
      table.projectId,
      table.promptId,
    ),
  ],
);
export const promptReviews = pgTable(
  "prompt_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    promptId: uuid("prompt_id").notNull(),
    version: integer("version").notNull(),
    hash: text("hash").notNull(),
    reviewer: text("reviewer").notNull(),
    note: text("note").notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.organizationId,
        table.projectId,
        table.promptId,
        table.version,
      ],
      foreignColumns: [
        promptVersions.organizationId,
        promptVersions.projectId,
        promptVersions.promptId,
        promptVersions.version,
      ],
      name: "prompt_reviews_version_fk",
    }).onDelete("cascade"),
    uniqueIndex("prompt_reviews_actor_unique").on(
      table.organizationId,
      table.projectId,
      table.promptId,
      table.version,
      table.reviewer,
    ),
  ],
);
export const promptActivity = pgTable(
  "prompt_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    promptId: uuid("prompt_id"),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "prompt_activity_project_fk",
    }).onDelete("cascade"),
    index("prompt_activity_asset_idx").on(
      table.organizationId,
      table.projectId,
      table.promptId,
      table.createdAt,
    ),
  ],
);
export const promptTransferPlans = pgTable(
  "prompt_transfer_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...promptScopeColumns(),
    actor: text("actor").notNull(),
    bundleHash: text("bundle_hash").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    expiresAt: timestampWithTimezone("expires_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "prompt_transfer_project_fk",
    }).onDelete("cascade"),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuthAccount = typeof authAccounts.$inferSelect;
export type OrganizationMembership =
  typeof organizationMemberships.$inferSelect;
export type OrganizationInvitation =
  typeof organizationInvitations.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectEnvironment = typeof projectEnvironments.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type ModelRateCard = typeof modelRateCards.$inferSelect;
export type WorkflowRevision = typeof workflowRevisions.$inferSelect;
export type StudioRunProjection = typeof studioRuns.$inferSelect;
export type StudioSessionProjection = typeof studioSessions.$inferSelect;
export type StudioInterruptProjection = typeof studioInterrupts.$inferSelect;
export type TelemetryEventRecord = typeof telemetryEvents.$inferSelect;

/** Private diagnostics are loaded independently of the bounded event/read models. */
export const errorDiagnostics = pgTable(
  "error_diagnostics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    diagnosticId: uuid("diagnostic_id").notNull(),
    environment: text("environment").notNull(),
    manifest: jsonb("manifest").$type<DiagnosticManifest>().notNull(),
    content: text("content"),
    state: text("state").notNull().default("pending"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    expiresAt: timestampWithTimezone("expires_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "error_diagnostics_project_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("error_diagnostics_scope_identity_unique").on(
      table.organizationId,
      table.projectId,
      table.environment,
      table.diagnosticId,
    ),
    uniqueIndex("error_diagnostics_scope_id_unique").on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    index("error_diagnostics_expiry_idx").on(table.expiresAt),
  ],
);
export const errorDiagnosticParts = pgTable(
  "error_diagnostic_parts",
  {
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    diagnosticRecordId: uuid("diagnostic_record_id").notNull(),
    index: integer("part_index").notNull(),
    data: text("data").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.organizationId,
        table.projectId,
        table.diagnosticRecordId,
      ],
      foreignColumns: [
        errorDiagnostics.organizationId,
        errorDiagnostics.projectId,
        errorDiagnostics.id,
      ],
      name: "error_diagnostic_parts_tenant_fk",
    }).onDelete("cascade"),
    uniqueIndex("error_diagnostic_parts_identity_unique").on(
      table.diagnosticRecordId,
      table.index,
    ),
  ],
);
export const diagnosticAccess = pgTable(
  "diagnostic_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    diagnosticId: uuid("diagnostic_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    occurredAt: timestampWithTimezone("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "diagnostic_access_project_tenant_fk",
    }).onDelete("cascade"),
    index("diagnostic_access_scope_idx").on(
      table.organizationId,
      table.projectId,
      table.occurredAt,
    ),
  ],
);
