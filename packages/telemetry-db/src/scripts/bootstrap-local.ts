import {
  createTelemetryApiKey,
  createTelemetryDbClient,
  ensureLocalDevelopmentProject,
  seedDefaultModelRateCards,
  upsertTelemetryApiKey,
} from "../index";

const databaseUrl = process.env.DATABASE_URL;
const pepper = process.env.KORTYX_API_KEY_PEPPER ?? "dev-insecure-pepper";
const telemetryApiKey = process.env.KORTYX_TELEMETRY_API_KEY;
const studioApiKey = process.env.KORTYX_STUDIO_API_KEY;

const ensureApiKey = async (
  client: ReturnType<typeof createTelemetryDbClient>,
  input: {
    apiKey: string | undefined;
    organizationId: string;
    projectId: string;
    name: string;
    scopes: string[];
  },
): Promise<{ apiKey: string; keyId: string }> => {
  const base = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    name: input.name,
    mode: "test" as const,
    scopes: input.scopes,
    pepper,
  };

  if (input.apiKey) {
    return upsertTelemetryApiKey(client.db, {
      ...base,
      apiKey: input.apiKey,
    });
  }

  return createTelemetryApiKey(client.db, base);
};

const main = async (): Promise<void> => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = createTelemetryDbClient(databaseUrl);

  try {
    const project = await ensureLocalDevelopmentProject(client.db);
    const telemetryKey = await ensureApiKey(client, {
      apiKey: telemetryApiKey,
      organizationId: project.organizationId,
      projectId: project.projectId,
      name: "Local SDK telemetry key",
      scopes: ["telemetry:write"],
    });
    const studioKey = await ensureApiKey(client, {
      apiKey: studioApiKey,
      organizationId: project.organizationId,
      projectId: project.projectId,
      name: "Local Studio read key",
      scopes: ["studio:read"],
    });

    console.log("Kortyx telemetry local project bootstrapped.");
    console.log(`Organization ID: ${project.organizationId}`);
    console.log(`Project ID: ${project.projectId}`);
    console.log(`SDK telemetry API key: ${telemetryKey.apiKey}`);
    console.log(`Studio read API key: ${studioKey.apiKey}`);
    const rates = await seedDefaultModelRateCards(client.db);
    console.log(
      `Default rate cards inserted: ${rates.inserted}. Skipped: ${rates.skipped}.`,
    );
    console.log("Store these keys now; only their hashes are persisted.");
  } finally {
    await client.close();
  }
};

void main();
