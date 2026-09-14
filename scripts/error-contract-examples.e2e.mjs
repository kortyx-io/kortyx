import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(resolve(root, "apps/studio/package.json"));
const { chromium, expect } = require("@playwright/test");
const processes = [];
const checks = [];
const evidence =
  process.env.KORTYX_EXAMPLE_EVIDENCE_DIR ??
  "/tmp/kortyx-example-error-evidence";
const passed = (check) => {
  checks.push(check);
  console.log(`PASS ${check}`);
};
const port = async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
};
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const name of [
    "kortyx-nextjs-chat-api-route",
    "kortyx-nextjs-chat-server-action",
    "kortyx-canvas",
  ]) {
    const app = resolve(root, "examples", name);
    const appRequire = createRequire(resolve(app, "package.json"));
    const httpPort = await port();
    const child = spawn(
      process.execPath,
      [
        appRequire.resolve("next/dist/bin/next"),
        "start",
        "-p",
        String(httpPort),
        "-H",
        "127.0.0.1",
      ],
      {
        cwd: app,
        env: {
          ...process.env,
          NODE_ENV: "production",
          KORTYX_REDIS_URL: "",
          REDIS_URL: "",
          KORTYX_FRAMEWORK_REDIS_URL: "",
          GOOGLE_API_KEY: "fixture",
          GOOGLE_GENERATIVE_AI_API_KEY: "fixture",
          KORTYX_API_URL: "",
          KORTYX_TELEMETRY_API_URL: "",
          KORTYX_TELEMETRY_API_KEY: "",
          NODE_OPTIONS: `--require ${resolve(root, "scripts/support/example-google-fixture.cjs")}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    for (const out of [child.stdout, child.stderr])
      out.on("data", (data) => {
        logs = (logs + data).slice(-6000);
      });
    processes.push(child);
    const base = `http://127.0.0.1:${httpPort}`;
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(`${name} exited: ${logs}`);
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(200);
    }
    assert(ready, `${name} did not start: ${logs}`);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    const input = page.locator("textarea").first();
    await input.waitFor();
    const submit = async (text) => {
      await input.fill(text);
      await input.press("Enter");
    };
    const idle = () =>
      input
        .waitFor({ state: "visible" })
        .then(() =>
          page.waitForFunction(
            () => !document.querySelector("textarea")?.disabled,
          ),
        );
    for (const status of [503, 401]) {
      await submit(`CASE:${status}`);
      await page
        .getByText(`Provider request failed (HTTP ${status}).`, { exact: true })
        .first()
        .waitFor();
      await expect(
        page
          .getByText(`Provider request failed (HTTP ${status}).`, {
            exact: true,
          })
          .first(),
      ).toBeInViewport({ ratio: 1 });
      await idle();
      assert(
        !(await page.locator("body").innerText()).includes(
          "DO_NOT_EXPORT_PROVIDER_SECRET",
        ),
      );
      passed(`${name}: HTTP ${status} displays safe failure`);
    }
    await submit("CASE:ok");
    await page
      .getByText("Verified example response.", { exact: true })
      .first()
      .waitFor();
    await idle();
    passed(`${name}: successful new turn after failures`);
    await submit("CASE:partial");
    await page
      .getByText("The provider returned an invalid response.", { exact: true })
      .first()
      .waitFor();
    await expect(
      page
        .getByText("The provider returned an invalid response.", {
          exact: true,
        })
        .first(),
    ).toBeInViewport({ ratio: 1 });
    await idle();
    assert(
      (await page.locator("body").innerText()).includes(
        "Partial answer visible.",
      ),
    );
    passed(`${name}: partial answer retained with terminal failure`);
    await page.screenshot({
      path: resolve(evidence, `${name}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], `${name}: browser exceptions`);
    passed(`${name}: no uncaught browser exceptions`);
    await page.close();
    child.kill("SIGTERM");
  }
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        productionBuilds: true,
        providerBoundary: "deterministic HTTP fixture",
        evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  for (const child of processes)
    if (child.exitCode === null) child.kill("SIGTERM");
}
