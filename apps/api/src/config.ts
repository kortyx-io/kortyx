import type { ApiDeployment } from "./auth/contracts";

export type ApiConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  apiKeyPepper: string;
  nodeEnv: string;
  deployment: ApiDeployment;
};

export const loadApiConfig = (): ApiConfig => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const deployment = process.env.KORTYX_API_DEPLOYMENT ?? "self-hosted";
  if (deployment !== "self-hosted" && deployment !== "cloud") {
    throw new Error("KORTYX_API_DEPLOYMENT must be self-hosted or cloud.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const apiKeyPepper =
    process.env.KORTYX_API_KEY_PEPPER ??
    (nodeEnv === "production" ? undefined : "dev-insecure-pepper");
  if (!apiKeyPepper) {
    throw new Error("KORTYX_API_KEY_PEPPER is required in production.");
  }

  return {
    host: process.env.API_HOST ?? "0.0.0.0",
    port: Number(process.env.API_PORT ?? "6400"),
    databaseUrl,
    apiKeyPepper,
    nodeEnv,
    deployment,
  };
};
