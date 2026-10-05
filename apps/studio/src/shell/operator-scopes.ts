import "server-only";
import {
  STUDIO_API_PROTOCOL_VERSION,
  StudioContextResponseSchema,
} from "@kortyx/telemetry-contracts";
import { cookies } from "next/headers";
import { cache } from "react";

export const OPERATOR_PROJECT_COOKIE = "studio_project";
export const OPERATOR_ENVIRONMENT_COOKIE = "studio_environment";
export function operatorKeys(): string[] {
  const raw = process.env.KORTYX_STUDIO_PROJECT_KEYS;
  const keys: unknown = raw
    ? JSON.parse(raw)
    : [process.env.KORTYX_STUDIO_API_KEY].filter(Boolean);
  if (
    !Array.isArray(keys) ||
    keys.length > 50 ||
    keys.some((key) => typeof key !== "string" || !key)
  )
    throw new Error("Invalid operator project key configuration.");
  return keys as string[];
}

/** Server-held keys define available projects. Browser input never defines a key. */
export const getOperatorScopes = cache(async () => {
  const keys = operatorKeys();
  const url = process.env.KORTYX_API_URL;
  if (!url || !keys.length) return null;
  const scopes = await Promise.all(
    (keys as string[]).map(async (key, index) => {
      const response = await fetch(
        `${url.replace(/\/$/, "")}/v1/studio/context`,
        {
          headers: {
            authorization: `Bearer ${key}`,
            "x-kortyx-studio-api-version": STUDIO_API_PROTOCOL_VERSION,
          },
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new Error("Operator project context unavailable.");
      return {
        id: String(index),
        key,
        context: StudioContextResponseSchema.parse(await response.json()),
      };
    }),
  );
  const jar = await cookies();
  const selected =
    scopes.find(
      (scope) => scope.id === jar.get(OPERATOR_PROJECT_COOKIE)?.value,
    ) ?? scopes[0];
  if (!selected) return null;
  const names = selected.context.environments;
  const requested = jar.get(OPERATOR_ENVIRONMENT_COOKIE)?.value;
  const environment =
    requested && names.includes(requested)
      ? requested
      : names.includes("default")
        ? "default"
        : names[0];
  return { scopes, selected, environment };
});
