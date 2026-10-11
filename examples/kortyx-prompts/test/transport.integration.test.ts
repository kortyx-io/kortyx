import { describe, expect, it } from "vitest";

const base = process.env.PROMPT_EXAMPLE_BASE_URL;
describe.skipIf(!base)("Studio prompt example transport", () => {
  it("keeps server-side checkpoint prompt snapshots out of public chat responses", async () => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Help me reset my password" }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("support");
    expect(text).not.toContain("__promptSnapshot");
    expect(text).not.toContain("__promptPin:");
    expect(text).not.toContain("variablesSchema");
    const result = JSON.parse(text);
    expect(
      result.events.some(
        (event: { type: string }) => event.type === "checkpoint",
      ),
    ).toBe(true);
  }, 30_000);
  it("requires a service key for machine evals and advertises typed prompt contracts", async () => {
    expect((await fetch(`${base}/api/evals`)).status).toBe(401);
    const response = await fetch(`${base}/api/evals`, {
      headers: {
        authorization: `Bearer ${process.env.EVAL_SERVICE_KEY ?? "local-prompt-example-service-key-32-chars"}`,
      },
    });
    expect(response.status).toBe(200);
    const manifest = await response.json();
    expect(manifest.promptContracts).toContainEqual(
      expect.objectContaining({
        id: "canvas/classify-intent",
        format: "system-user",
      }),
    );
  });
});
