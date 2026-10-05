import { afterEach, beforeEach, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
  }),
}));

import { studioAuth } from "../auth/server";
import { getOperatorScopes } from "./operator-scopes";
import { studioShell } from "./server";

beforeEach(() => {
  jar.clear();
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "basic");
  vi.stubEnv("KORTYX_API_URL", "https://api.test");
  vi.stubEnv(
    "KORTYX_STUDIO_PROJECT_KEYS",
    JSON.stringify(["private-key-A", "private-key-B"]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      Response.json({
        organization: { name: "Local" },
        project: { name: init.headers.authorization.endsWith("A") ? "A" : "B" },
        environments: ["default", "staging"],
        apiKey: { mode: "test", scopes: ["studio:read"] },
        api: { status: "ok", service: "kortyx-api", version: "test" },
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("selects configured server credentials rather than accepting browser credentials", async () => {
  jar.set("studio_project", "1");
  jar.set("studio_environment", "staging");
  expect(await studioAuth.getApiCredential()).toEqual({
    authorization: "Bearer private-key-B",
    environment: "staging",
  });
  jar.set("studio_project", "arbitrary-key");
  expect((await studioAuth.getApiCredential())?.authorization).toBe(
    "Bearer private-key-A",
  );
});
it("defaults to a registered scope and never serializes keys into navbar props", async () => {
  const scope = await getOperatorScopes();
  expect(scope?.environment).toBe("default");
  const shell = await studioShell.resolve({} as never);
  expect(shell.projectSwitcher).toBeDefined();
  expect(shell.environmentSwitcher).toBeDefined();
  expect(JSON.stringify(shell)).not.toContain("private-key-");
  expect(shell.organizationSwitcher).toBeUndefined();
});
it("requires same-origin JSON mutations and denies an unconfigured scope", async () => {
  const request = (origin: string, value: string) =>
    new Request("https://studio.test/auth/operator-scope", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ kind: "project", value }),
    });
  expect(
    (await studioAuth.handleAuthRequest(request("https://attacker.test", "1")))
      .status,
  ).toBe(403);
  expect(
    (
      await studioAuth.handleAuthRequest(
        request("https://studio.test", "unknown"),
      )
    ).status,
  ).toBe(403);
  const response = await studioAuth.handleAuthRequest(
    request("https://studio.test", "1"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(
    (
      await studioAuth.handleAuthRequest(
        new Request("https://studio.test/auth/operator-scope", {
          method: "POST",
          headers: {
            origin: "https://studio.test",
            "content-type": "application/json",
          },
          body: "invalid",
        }),
      )
    ).status,
  ).toBe(400);
});
it("initializes Default for explicitly unauthenticated operator development", async () => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "none");
  const response = await studioAuth.authorize(
    new Request("https://studio.test/runs", {
      headers: { accept: "text/html" },
    }),
  );
  expect(response?.status).toBe(307);
  expect(response?.headers.get("set-cookie")).toContain(
    "studio_environment=default",
  );
});
