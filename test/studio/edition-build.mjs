import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const studio = fileURLToPath(new URL("../../apps/studio/", import.meta.url));
const fixture = fileURLToPath(new URL("./edition-fixture.ts", import.meta.url));
const require = createRequire(
  new URL("../../apps/studio/package.json", import.meta.url),
);
const next = require.resolve("next/dist/bin/next");
const env = {
  ...process.env,
  KORTYX_STUDIO_AUTH_MODE: "cloud",
  KORTYX_STUDIO_EDITION_MODULE: fixture,
  // A missing adapter must never fall back to this shared credential.
  KORTYX_STUDIO_API_KEY: "edition-test-must-not-use-this-key",
};
const run = (args) =>
  spawn(process.execPath, [next, ...args], {
    cwd: studio,
    env,
    stdio: "inherit",
  });
const exited = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

assert.equal(
  (
    await exited(
      run(
        process.argv.includes("--webpack") ? ["build", "--webpack"] : ["build"],
      ),
    )
  ).code,
  0,
  "Edition build must succeed",
);
// Ask the OS for an available local port instead of colliding with dev servers.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const server = run([
  "start",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
]);
const stopped = exited(server);
let failed = false;
void stopped.then(() => {
  failed = true;
});
try {
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  let login;
  while (Date.now() < deadline && !failed) {
    try {
      login = await fetch(`${url}/auth/login`, {
        signal: AbortSignal.timeout(1000),
        redirect: "manual",
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(login, "Edition server must become ready");
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { edition: "compiled-edition-fixture" });
  for (const [path, method] of [
    ["/", "GET"],
    ["/api/studio/changes", "GET"],
    ["/api/studio/runs/test.json/review", "DELETE"],
  ]) {
    const response = await fetch(`${url}${path}`, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 401, `${path} must use the compiled edition`);
    assert.equal(await response.text(), "Fixture denies application access");
  }
  console.log(
    "Compiled external Studio edition: auth route, proxy, and direct API authorization passed.",
  );
} finally {
  server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
  timer.unref();
  await stopped;
  clearTimeout(timer);
}
