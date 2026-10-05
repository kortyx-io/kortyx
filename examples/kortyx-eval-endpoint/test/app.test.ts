import { expect, it } from "vitest";
import { createApp } from "../src/app";

it("mounts a protected real SDK manifest without needing a provider key or executing the workflow", async () => {
  const key = "private-demo-service-key".repeat(2);
  const app = createApp(key);
  expect((await app.request("/api/evals")).status).toBe(401);
  const response = await app.request("/api/evals", {
    headers: { authorization: `Bearer ${key}` },
  });
  const manifest = await response.json();
  expect(response.status).toBe(200);
  expect(manifest.studioJudging).toBe(true);
  expect(manifest.suites[0].id).toBe("catalog-smoke");
  expect(manifest.suites[0].cases[0].workflowId).toBe("catalog");
  expect(JSON.stringify(manifest)).not.toContain(key);
  expect(
    (
      await app.request("/wrong/evals", {
        headers: { authorization: `Bearer ${key}` },
      })
    ).status,
  ).toBe(404);
});
