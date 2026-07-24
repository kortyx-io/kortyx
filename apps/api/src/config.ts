export type ApiConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  apiKeyPepper: string;
  nodeEnv: string;
};

export const loadApiConfig = (): ApiConfig => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
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
  };
};
