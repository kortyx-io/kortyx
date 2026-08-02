import type {
  EnsureWorkflowTopologyRequest,
  KortyxTelemetryEvent,
  StudioInterrupt,
  StudioRun,
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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
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
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
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
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestampWithTimezone("expires_at").notNull(),
    acceptedAt: timestampWithTimezone("accepted_at"),
    revokedAt: timestampWithTimezone("revoked_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
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
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => [
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
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
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
