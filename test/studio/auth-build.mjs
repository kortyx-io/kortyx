import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const studio = fileURLToPath(new URL("../../apps/studio/", import.meta.url));
const require = createRequire(
  new URL("../../apps/studio/package.json", import.meta.url),
);
const next = require.resolve("next/dist/bin/next");
// Exercise the private profile's app-local placement without checking it into OSS.
const profileName = `tsconfig.studio-test-${randomUUID()}.json`;
const profile = join(studio, profileName);
writeFileSync(
  profile,
  JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      paths: {
        "@/*": ["./src/*"],
        "@studio/auth": ["../../test/studio/auth-fixture.ts"],
        "@studio/auth-contracts": ["./src/auth/contracts.ts"],
      },
    },
  }),
  { flag: "wx" },
);
process.on("exit", () => {
  rmSync(profile, { force: true });
  rmSync(profile.replace(/\.json$/, ".tsbuildinfo"), { force: true });
});
const env = {
  ...process.env,
  KORTYX_STUDIO_AUTH_MODE: "cloud",
  KORTYX_STUDIO_TSCONFIG: profileName,
  KORTYX_STUDIO_API_KEY: "auth-test-must-not-use-this-key",
};
const exited = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
const run = (args) =>
  spawn(process.execPath, [next, ...args], {
    cwd: studio,
    env,
    stdio: "inherit",
  });
async function typeCheck(config, valid) {
  const child = spawn("pnpm", ["type-check"], {
    cwd: studio,
    env: { ...env, KORTYX_STUDIO_TSCONFIG: config },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const { code } = await exited(child);
  if (valid) assert.equal(code, 0, output);
  else {
    assert.notEqual(
      code,
      0,
      "Invalid selected adapter must fail type-checking",
    );
    assert.match(output, /auth-invalid\.ts/);
    assert.match(output, /number/);
  }
}
await typeCheck("../../test/studio/tsconfig.invalid-auth.json", false);
await typeCheck(env.KORTYX_STUDIO_TSCONFIG, true);
console.log(
  "Selected app-local tsconfig checks the valid adapter and rejects the invalid adapter.",
);
if (process.argv.includes("--typecheck-only")) process.exit(0);

const received = [];
const upstream = createServer((request, response) => {
  received.push(request.headers.authorization);
  setTimeout(() => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${request.headers.authorization}\n\n`);
  }, 25);
});
const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
await listen(upstream);
env.KORTYX_API_URL = `http://127.0.0.1:${upstream.address().port}`;

async function smoke(mode) {
  const probe = createServer();
  await listen(probe);
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const server = run([mode, "--hostname", "127.0.0.1", "--port", String(port)]);
  const stopped = exited(server);
  let failed = false;
  void stopped.then(() => {
    failed = true;
  });
  try {
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60_000;
    let login;
    while (Date.now() < deadline && !failed) {
      try {
        login = await fetch(`${url}/auth/login`, {
          signal: AbortSignal.timeout(15_000),
          redirect: "manual",
        });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert.ok(login, `${mode} server must become ready`);
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { adapter: "compiled-auth-fixture" });
    for (const [path, method] of [
      ["/", "GET"],
      ["/api/studio/changes", "GET"],
      ["/api/studio/runs/test.json/review", "DELETE"],
    ]) {
      const response = await fetch(`${url}${path}`, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      assert.equal(
        response.status,
        401,
        `${path} must use the selected adapter`,
      );
      assert.equal(await response.text(), "Fixture denies application access");
    }
    await Promise.all(
      ["alice", "bob"].map(async (actor) => {
        const response = await fetch(`${url}/api/studio/changes`, {
          headers: { "x-studio-auth-fixture": actor },
          signal: AbortSignal.timeout(20_000),
        });
        assert.equal(response.status, 200);
        assert.equal(
          await response.text(),
          `data: Bearer fixture-${actor}\n\n`,
        );
      }),
    );
    const count = received.length;
    const missing = await fetch(`${url}/api/studio/changes`, {
      headers: { "x-studio-auth-fixture": "missing" },
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(missing.status, 503);
    assert.equal(
      received.length,
      count,
      "Missing credentials must never contact the API",
    );
    assert.ok(
      !received.some((value) => value?.includes(env.KORTYX_STUDIO_API_KEY)),
    );
    console.log(
      `${mode}: selected auth, direct denial, concurrent request credentials and no shared-key fallback passed.`,
    );
  } finally {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    timer.unref();
    await stopped;
    clearTimeout(timer);
  }
}
try {
  assert.equal(
    (
      await exited(
        run(
          process.argv.includes("--webpack")
            ? ["build", "--webpack"]
            : ["build"],
        ),
      )
    ).code,
    0,
    "Selected adapter build must succeed",
  );
  await smoke("start");
  await smoke("dev");
} finally {
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
}
