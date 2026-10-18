const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const {
  verifyUpgrade: verifySnapshot,
} = require("../studio/verify-upgrade-snapshot.cjs");
const verifyUpgrade = (before, after, env, version = "0.20.1") =>
  verifySnapshot(before, after, env, version);

test("manual recovery can reuse both staging digests without bypassing native smoke", () => {
  const workflow = readFileSync(
    join(__dirname, "../../workflows/release-studio-images.yml"),
    "utf8",
  );
  const dispatch = workflow
    .split("  workflow_dispatch:")[1]
    .split("permissions:")[0];
  assert.match(dispatch, /api_digest:/);
  assert.match(dispatch, /studio_digest:/);
  assert.match(workflow, /needs.smoke.result == 'success'/);
  assert.match(
    workflow,
    /inputs.api_digest == '' && inputs.studio_digest == ''/,
  );
  const smoke = readFileSync(
    join(__dirname, "../studio/smoke-upgrade.sh"),
    "utf8",
  );
  assert.match(smoke, /verify-upgrade-snapshot.cjs/);
  assert.match(
    smoke,
    /cmp "\$state_dir\/after.json" "\$state_dir\/retry.json"/,
  );
});
const env = {
  KORTYX_TELEMETRY_API_KEY: "ktyx_test_sdk_synthetic",
  KORTYX_STUDIO_API_KEY: "ktyx_test_studio_synthetic",
};
const before = () => ({
  keys: "credential-hash",
  events: "events-hash",
  runs: "runs-hash",
  sessions: "sessions-hash",
  oids: { api_keys: 123 },
  key_scopes: {
    sdk: ["telemetry:write"],
    studio: ["studio:read", "studio:write", "eval:run"],
    custom: ["telemetry:write"],
  },
});
const after = () => ({
  ...before(),
  key_scopes: {
    sdk: ["telemetry:write", "prompt:serve"],
    studio: [
      "studio:read",
      "studio:write",
      "eval:run",
      "prompt:promote",
      "prompt:review",
      "prompt:settings",
    ],
    custom: ["telemetry:write"],
  },
});

test("accepts only the documented managed-key scope expansion", () =>
  verifyUpgrade(before(), after(), env));
test("already-upgraded managed keys retain their exact scopes", () =>
  verifyUpgrade(after(), after(), env));
test("0.21 requires managed Studio diagnostics and evaluation grants, including with legacy flags", () => {
  const data = after();
  data.key_scopes.studio.push("diagnostics:read");
  verifyUpgrade(after(), data, env, "0.21.0");
  verifyUpgrade(
    before(),
    data,
    { ...env, KORTYX_STUDIO_ENABLE_PROMPTS: "0" },
    "0.21.0",
  );
  verifyUpgrade(data, data, env, "0.21.0");
  assert.throws(() => verifyUpgrade(after(), after(), env, "0.21.0"));
  assert.throws(() => verifyUpgrade(after(), data, env, "0.20.1"));
  for (const id of ["sdk", "custom"]) {
    const widened = structuredClone(data);
    widened.key_scopes[id].push("diagnostics:read");
    assert.throws(() => verifyUpgrade(after(), widened, env, "0.21.0"));
  }
  const widened = structuredClone(data);
  widened.key_scopes.studio.push("admin:all");
  assert.throws(() => verifyUpgrade(after(), widened, env, "0.21.0"));
});
test("0.20.1 default installation gains evaluation permission when upgrading with the flag-free CLI", () => {
  // The current CLI no longer emits feature flags. Starting the previous image
  // with that Compose file therefore creates a Studio key without eval:run.
  const previous = after();
  previous.key_scopes.studio = previous.key_scopes.studio.filter(
    (scope) => scope !== "eval:run",
  );
  const next = after();
  next.key_scopes.studio.push("diagnostics:read");
  verifyUpgrade(previous, next, env, "0.21.0");
  const missingEval = structuredClone(next);
  missingEval.key_scopes.studio = missingEval.key_scopes.studio.filter(
    (scope) => scope !== "eval:run",
  );
  assert.throws(
    () => verifyUpgrade(previous, missingEval, env, "0.21.0"),
    /missing \[eval:run\]/,
  );
  assert.throws(() => verifyUpgrade(previous, next, env, "0.20.1"));
  for (const id of ["sdk", "custom"]) {
    const widened = structuredClone(next);
    widened.key_scopes[id].push("eval:run");
    assert.throws(() => verifyUpgrade(previous, widened, env, "0.21.0"));
  }
});
test("all 16 legacy feature combinations upgrade to the exact native bootstrap contract", () => {
  for (let flags = 0; flags < 16; flags++) {
    const previous = before();
    previous.key_scopes.sdk = ["telemetry:write"];
    previous.key_scopes.studio = ["studio:read"];
    if (flags & 1) {
      previous.key_scopes.sdk.push("prompt:serve");
      previous.key_scopes.studio.push(
        "studio:write",
        "prompt:promote",
        "prompt:review",
        "prompt:settings",
      );
    }
    if (flags & 2) previous.key_scopes.studio.push("diagnostics:read");
    if (flags & 4) previous.key_scopes.studio.push("studio:write");
    if (flags & 8) previous.key_scopes.studio.push("eval:run");
    const next = after();
    next.key_scopes.studio.push("diagnostics:read");
    verifyUpgrade(
      previous,
      next,
      {
        ...env,
        KORTYX_STUDIO_ENABLE_PROMPTS: flags & 1 ? "1" : "0",
        KORTYX_STUDIO_ENABLE_DIAGNOSTICS: flags & 2 ? "1" : "0",
        KORTYX_STUDIO_ENABLE_REVIEWS: flags & 4 ? "1" : "0",
        KORTYX_STUDIO_ENABLE_EVALS: flags & 8 ? "1" : "0",
      },
      "0.21.0",
    );
  }
});
test("target release version is required and validated", () => {
  for (const version of [
    undefined,
    "",
    "v0.21.0",
    "0.21.0-dev",
    "0.21",
    "00.21.0",
  ])
    assert.throws(() => verifySnapshot(before(), after(), env, version));
});
test("scope order and duplicate grants do not change effective permissions", () => {
  const data = after();
  data.key_scopes.studio.reverse().push("studio:write");
  verifyUpgrade(before(), data, env);
});
test("disabled prompts require unchanged scopes", () => {
  verifyUpgrade(before(), before(), {
    ...env,
    KORTYX_STUDIO_ENABLE_PROMPTS: "0",
  });
  assert.throws(() =>
    verifyUpgrade(before(), after(), {
      ...env,
      KORTYX_STUDIO_ENABLE_PROMPTS: "0",
    }),
  );
});
for (const field of ["keys", "events", "runs", "sessions", "oids"]) {
  test(`rejects changed ${field}`, () => {
    const data = after();
    data[field] = "changed";
    assert.throws(
      () => verifyUpgrade(before(), data, env),
      /Upgrade changed persisted/,
    );
  });
}
test("rejects missing, added, or weakened scopes and changes to custom keys", () => {
  for (const mutate of [
    (s) => {
      s.sdk = ["prompt:serve"];
    },
    (s) => {
      s.studio.push("admin:all");
    },
    (s) => {
      s.custom.push("prompt:serve");
    },
    (s) => {
      s.studio = ["studio:read", "studio:write", "eval:run"];
    },
    (s) => {
      delete s.custom;
    },
    (s) => {
      s.extra = ["studio:read"];
    },
  ]) {
    const data = after();
    mutate(data.key_scopes);
    assert.throws(() => verifyUpgrade(before(), data, env));
  }
});
test("requires scope evidence and valid distinct fixture credentials", () => {
  assert.throws(() =>
    verifyUpgrade({ ...before(), key_scopes: undefined }, after(), env),
  );
  assert.throws(() => verifyUpgrade(before(), after(), {}));
  assert.throws(() =>
    verifyUpgrade(before(), after(), {
      ...env,
      KORTYX_STUDIO_API_KEY: env.KORTYX_TELEMETRY_API_KEY,
    }),
  );
});
