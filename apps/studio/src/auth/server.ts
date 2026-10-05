import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { constantTimeEqual } from "../lib/constant-time-equal";
import { getStudioAuthConfig } from "../lib/studio-auth";
import {
  getOperatorScopes,
  OPERATOR_ENVIRONMENT_COOKIE,
  OPERATOR_PROJECT_COOKIE,
  operatorKeys,
} from "../shell/operator-scopes";
import type { StudioAuthAdapter } from "./contracts";

async function initializeOperatorScope(request: Request) {
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/api/") ||
    !request.headers.get("accept")?.includes("text/html")
  )
    return null;
  const scope = await getOperatorScopes();
  const jar = await cookies();
  if (
    !scope?.environment ||
    (jar.get(OPERATOR_ENVIRONMENT_COOKIE)?.value === scope.environment &&
      jar.get(OPERATOR_PROJECT_COOKIE)?.value === scope.selected.id)
  )
    return null;
  const response = NextResponse.redirect(url);
  const options = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: url.protocol === "https:",
    path: "/",
  };
  response.cookies.set(OPERATOR_ENVIRONMENT_COOKIE, scope.environment, options);
  response.cookies.set(OPERATOR_PROJECT_COOKIE, scope.selected.id, options);
  return response;
}

/** Default OSS auth adapter. A selected tsconfig replaces this module, not the app. */
export const studioAuth: StudioAuthAdapter = {
  async authorize(request) {
    const config = getStudioAuthConfig();
    if (config.mode === "none") return initializeOperatorScope(request);
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
    if (
      constantTimeEqual(expected, request.headers.get("authorization") ?? "")
    ) {
      return initializeOperatorScope(request);
    }
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
    const keys = operatorKeys();
    if (!keys.length) return null;
    const jar = await cookies();
    const index = jar.get(OPERATOR_PROJECT_COOKIE)?.value ?? "0";
    const key = keys[Number(index)] ?? keys[0];
    if (!key) return null;
    const environment =
      jar.get(OPERATOR_ENVIRONMENT_COOKIE)?.value ??
      process.env.KORTYX_STUDIO_ENVIRONMENT;
    return {
      authorization: `Bearer ${key}`,
      ...(environment ? { environment } : {}),
    };
  },
  async handleAuthRequest(request) {
    if (
      new URL(request.url).pathname === "/auth/operator-scope" &&
      request.method === "POST"
    ) {
      if (
        request.headers.get("origin") !== new URL(request.url).origin ||
        request.headers.get("content-type") !== "application/json"
      )
        return Response.json({ error: "Request denied." }, { status: 403 });
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object")
        return Response.json({ error: "Invalid request." }, { status: 400 });
      const scope = await getOperatorScopes();
      const valid =
        scope &&
        typeof body.value === "string" &&
        (body.kind === "project"
          ? scope.scopes.some((row) => row.id === body.value)
          : body.kind === "environment" &&
            scope.selected.context.environments.includes(body.value));
      if (!valid)
        return Response.json({ error: "Scope unavailable." }, { status: 403 });
      const response = NextResponse.json({ ok: true });
      response.cookies.set(
        body.kind === "project"
          ? OPERATOR_PROJECT_COOKIE
          : OPERATOR_ENVIRONMENT_COOKIE,
        body.value,
        {
          httpOnly: true,
          sameSite: "strict",
          secure: new URL(request.url).protocol === "https:",
          path: "/",
        },
      );
      if (body.kind === "project")
        response.cookies.delete(OPERATOR_ENVIRONMENT_COOKIE);
      return response;
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  },
};
