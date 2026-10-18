import { lt } from "drizzle-orm";
import { createTelemetryDbClient } from "../client";
import { expireErrorDiagnostics } from "../repositories/error-diagnostics";
import { diagnosticAccess, errorDiagnostics } from "../schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const client = createTelemetryDbClient(databaseUrl);
  try {
    // Run with an operator database role; cloud tenant roles cannot prune other projects.
    const scopes = await client.db
      .selectDistinct({
        organizationId: errorDiagnostics.organizationId,
        projectId: errorDiagnostics.projectId,
      })
      .from(errorDiagnostics)
      .where(lt(errorDiagnostics.expiresAt, new Date()));
    for (const scope of scopes) await expireErrorDiagnostics(client.db, scope);
    await client.db
      .delete(diagnosticAccess)
      .where(
        lt(diagnosticAccess.occurredAt, new Date(Date.now() - 90 * 86400_000)),
      );
    console.log(
      `Pruned expired diagnostics across ${scopes.length} project scopes; access audit retention is 90 days.`,
    );
  } finally {
    await client.close();
  }
}
void main();
