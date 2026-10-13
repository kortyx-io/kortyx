const assert = require("node:assert/strict");
const test = require("node:test");
const { verifyUpgrade } = require("../studio/verify-upgrade-snapshot.cjs");
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
