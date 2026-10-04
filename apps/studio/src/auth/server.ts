import "server-only";
import { constantTimeEqual } from "../lib/constant-time-equal";
import { getStudioAuthConfig } from "../lib/studio-auth";
import type { StudioAuthAdapter } from "./contracts";

/** Default OSS auth adapter. A selected tsconfig replaces this module, not the app. */
export const studioAuth: StudioAuthAdapter = {
  async authorize(request) {
    const config = getStudioAuthConfig();
    if (config.mode === "none") return null;
    if (config.mode === "cloud") {
      return new Response(
        "Cloud Studio auth mode is not available in this build.",
        { status: 500 },
      );
    }
    if (config.mode === "invalid") {
      return new Response(
        `Invalid KORTYX_STUDIO_AUTH_MODE '${config.value}'. Expected one of: none, basic, cloud.`,
        { status: 500 },
      );
    }
    if (!config.username || !config.password) {
      return new Response(
        "Kortyx Studio Basic Auth is enabled, but username/password env vars are missing.",
        { status: 500 },
      );
    }
    const expected = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    if (constantTimeEqual(expected, request.headers.get("authorization") ?? ""))
      return null;
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Kortyx Studio", charset="UTF-8"',
      },
    });
  },
  async getApiCredential() {
    const config = getStudioAuthConfig();
    // Never fall back to a shared API key when the Cloud auth adapter is missing.
    if (config.mode === "cloud" || config.mode === "invalid") return null;
    const key = process.env.KORTYX_STUDIO_API_KEY;
    return key ? { authorization: `Bearer ${key}` } : null;
  },
  async handleAuthRequest() {
    return Response.json({ error: "Not found." }, { status: 404 });
  },
};
