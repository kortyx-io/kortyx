import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryAuthError, TelemetryForbiddenError } from "../errors";
import { apiKeys } from "../schema";

export type ApiKeyMode = "test" | "live";

export type AuthenticatedTelemetryProject = {
  keyId: string;
  organizationId: string;
  projectId: string;
  mode: ApiKeyMode;
  scopes: string[];
};

export type CreateTelemetryApiKeyInput = {
  organizationId: string;
  projectId: string;
  name: string;
  mode?: ApiKeyMode;
  scopes?: string[];
  expiresAt?: Date | undefined;
};

export type UpsertTelemetryApiKeyInput = CreateTelemetryApiKeyInput & {
  apiKey: string;
  pepper: string;
};

const KEY_PATTERN = /^ktyx_(test|live)_([^_]+)_(.+)$/;
const DEFAULT_SCOPES = ["telemetry:write"];

export const parseTelemetryApiKey = (
  value: string,
):
  | {
      mode: ApiKeyMode;
      keyId: string;
      secret: string;
    }
  | undefined => {
  const match = KEY_PATTERN.exec(value);
  const mode = match?.[1];
  const keyId = match?.[2];
  const secret = match?.[3];
  if ((mode !== "test" && mode !== "live") || !keyId || !secret) {
    return undefined;
  }
  return { mode, keyId, secret };
};

export const hashTelemetryApiKeySecret = (
  secret: string,
  pepper: string,
): string => createHmac("sha256", pepper).update(secret).digest("hex");

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const createTelemetryApiKey = async (
  db: TelemetryDb,
  input: CreateTelemetryApiKeyInput & { pepper: string },
): Promise<{ apiKey: string; keyId: string }> => {
  const mode = input.mode ?? "test";
  const keyId = randomBytes(12).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const apiKey = `ktyx_${mode}_${keyId}_${secret}`;

  await db.insert(apiKeys).values({
    id: keyId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    mode,
    name: input.name,
    secretHash: hashTelemetryApiKeySecret(secret, input.pepper),
    scopes: input.scopes ?? DEFAULT_SCOPES,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  });

  return { apiKey, keyId };
};

export const upsertTelemetryApiKey = async (
  db: TelemetryDb,
  input: UpsertTelemetryApiKeyInput,
): Promise<{ apiKey: string; keyId: string }> => {
  const parsed = parseTelemetryApiKey(input.apiKey);
  if (!parsed) {
    throw new Error(
      "Invalid Kortyx API key format. Expected ktyx_test_<keyId>_<secret> or ktyx_live_<keyId>_<secret>.",
    );
  }

  await db
    .insert(apiKeys)
    .values({
      id: parsed.keyId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      mode: parsed.mode,
      name: input.name,
      secretHash: hashTelemetryApiKeySecret(parsed.secret, input.pepper),
      scopes: input.scopes ?? DEFAULT_SCOPES,
      enabled: true,
      revokedAt: null,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    })
    .onConflictDoUpdate({
      target: apiKeys.id,
      set: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        mode: parsed.mode,
        name: input.name,
        secretHash: hashTelemetryApiKeySecret(parsed.secret, input.pepper),
        scopes: input.scopes ?? DEFAULT_SCOPES,
        enabled: true,
        revokedAt: null,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    });

  return { apiKey: input.apiKey, keyId: parsed.keyId };
};

export const authenticateTelemetryApiKey = async (
  db: TelemetryDb,
  input: {
    apiKey: string;
    pepper: string;
    requiredScope?: string | undefined;
  },
): Promise<AuthenticatedTelemetryProject> => {
  const parsed = parseTelemetryApiKey(input.apiKey);
  if (!parsed) throw new TelemetryAuthError();

  const [record] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, parsed.keyId))
    .limit(1);

  if (!record) throw new TelemetryAuthError();
  if (!record.enabled || record.revokedAt) throw new TelemetryAuthError();
  if (record.expiresAt && record.expiresAt <= new Date()) {
    throw new TelemetryAuthError();
  }
  if (record.mode !== parsed.mode) throw new TelemetryAuthError();

  const hash = hashTelemetryApiKeySecret(parsed.secret, input.pepper);
  if (!safeEqual(hash, record.secretHash)) throw new TelemetryAuthError();

  const scopes = record.scopes;
  if (input.requiredScope && !scopes.includes(input.requiredScope)) {
    throw new TelemetryForbiddenError(
      `Telemetry API key is missing ${input.requiredScope} scope.`,
    );
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id));

  return {
    keyId: record.id,
    organizationId: record.organizationId,
    projectId: record.projectId,
    mode: parsed.mode,
    scopes,
  };
};
