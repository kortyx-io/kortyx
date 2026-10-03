import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { studioEdition } from "./edition";
import { proxy } from "./proxy";

vi.mock("server-only", () => ({}));
beforeEach(() => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "basic");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_USERNAME", "admin");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_PASSWORD", "password");
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "shared-oss-key");
});
afterEach(() => vi.unstubAllEnvs());

it("preserves Basic Auth for the self-hosted edition", async () => {
  const denied = await studioEdition.authorize(
    new Request("https://studio.test"),
  );
  expect(denied?.status).toBe(401);
  expect(denied?.headers.get("WWW-Authenticate")).toContain(
    'Basic realm="Kortyx Studio"',
  );
  expect(
    await studioEdition.authorize(
      new Request("https://studio.test", {
        headers: {
          authorization: `Basic ${Buffer.from("admin:password").toString("base64")}`,
        },
      }),
    ),
  ).toBeNull();
});

it("keeps development access explicit and proxy delegates to the edition", async () => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "none");
  expect(
    (await proxy(new NextRequest("https://studio.test"))).headers.get(
      "x-middleware-next",
    ),
  ).toBe("1");
});

it.each([
  "cloud",
  "invalid-mode",
])("fails closed in %s mode even with a global API key", async (mode) => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", mode);
  expect((await proxy(new NextRequest("https://studio.test"))).status).toBe(
    500,
  );
  expect(await studioEdition.getApiCredential()).toBeNull();
});

it("misconfigured production Basic Auth cannot silently allow requests", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_PASSWORD", "");
  expect(
    (await studioEdition.authorize(new Request("https://studio.test")))?.status,
  ).toBe(500);
});

it("resolves credentials at invocation time rather than retaining a module-global key", async () => {
  expect(await studioEdition.getApiCredential()).toEqual({
    authorization: "Bearer shared-oss-key",
  });
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "rotated-key");
  expect(await studioEdition.getApiCredential()).toEqual({
    authorization: "Bearer rotated-key",
  });
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "");
  expect(await studioEdition.getApiCredential()).toBeNull();
});

it("does not implement managed auth routes in the OSS default", async () => {
  expect(
    (
      await studioEdition.handleAuthRequest(
        new Request("https://studio.test/auth/login"),
      )
    ).status,
  ).toBe(404);
});
