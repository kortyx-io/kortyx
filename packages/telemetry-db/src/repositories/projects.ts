import { and, asc, eq } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryForbiddenError, TelemetryNotFoundError } from "../errors";
import { organizations, projectEnvironments, projects } from "../schema";

export type StudioProjectContext = {
  organizationName: string;
  projectName: string;
  environments: string[];
};

export const getStudioProjectContext = async (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string },
): Promise<StudioProjectContext> => {
  const [project] = await db
    .select({
      organizationName: organizations.name,
      projectName: projects.name,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.organizationId, organizations.id))
    .where(
      and(
        eq(organizations.id, input.organizationId),
        eq(projects.organizationId, input.organizationId),
        eq(projects.id, input.projectId),
      ),
    )
    .limit(1);

  if (!project) {
    throw new TelemetryNotFoundError("Studio project not found.");
  }

  const environments = await db
    .select({ name: projectEnvironments.name })
    .from(projectEnvironments)
    .where(
      and(
        eq(projectEnvironments.organizationId, input.organizationId),
        eq(projectEnvironments.projectId, input.projectId),
      ),
    )
    .orderBy(asc(projectEnvironments.name));

  return {
    ...project,
    environments: environments.map((environment) => environment.name),
  };
};

export const ensureProjectEnvironmentAllowed = async (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string; environment: string },
): Promise<void> => {
  const [environment] = await db
    .select({ id: projectEnvironments.id })
    .from(projectEnvironments)
    .where(
      and(
        eq(projectEnvironments.organizationId, input.organizationId),
        eq(projectEnvironments.projectId, input.projectId),
        eq(projectEnvironments.name, input.environment),
      ),
    )
    .limit(1);

  if (!environment) {
    throw new TelemetryForbiddenError(
      `Environment '${input.environment}' is not allowed for this project.`,
    );
  }
};

export const ensureLocalDevelopmentProject = async (
  db: TelemetryDb,
): Promise<{ organizationId: string; projectId: string }> => {
  const organizationName = "Local Development";
  const projectName = "Default Project";

  const [existingProject] = await db
    .select({
      organizationId: organizations.id,
      projectId: projects.id,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.organizationId, organizations.id))
    .where(
      and(
        eq(organizations.name, organizationName),
        eq(projects.name, projectName),
      ),
    )
    .limit(1);

  if (existingProject) return existingProject;

  const [organization] = await db
    .insert(organizations)
    .values({ name: organizationName })
    .returning({ id: organizations.id });

  if (!organization) throw new Error("Failed to create local organization.");

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: organization.id,
      name: projectName,
    })
    .returning({ id: projects.id });

  if (!project) throw new Error("Failed to create local project.");

  await db
    .insert(projectEnvironments)
    .values([
      {
        organizationId: organization.id,
        projectId: project.id,
        name: "development",
      },
      { organizationId: organization.id, projectId: project.id, name: "test" },
      {
        organizationId: organization.id,
        projectId: project.id,
        name: "production",
      },
    ])
    .onConflictDoNothing();

  return { organizationId: organization.id, projectId: project.id };
};
