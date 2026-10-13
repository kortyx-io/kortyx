const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { parseEnv } = require("node:util");

function verifyUpgrade(before, after, env, version) {
  assert.match(version ?? "", /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Missing or invalid target Studio version");
  const [major, minor] = version.split(".").map(Number);
  const nativeCapabilities = major > 0 || minor >= 21;
  // Keep customer rows, physical table identities and credential identities/hashes
  // byte-for-byte stable. Scope evolution is checked separately, never ignored.
  const { key_scopes: oldScopes, ...oldData } = before;
  const { key_scopes: newScopes, ...newData } = after;
  for (const field of new Set([
    ...Object.keys(oldData),
    ...Object.keys(newData),
  ])) {
    assert.deepEqual(
      newData[field],
      oldData[field],
      `Upgrade changed persisted ${field}`,
    );
  }
  assert.ok(oldScopes && newScopes, "Missing API key scope evidence");
  assert.deepEqual(
    Object.keys(newScopes).sort(),
    Object.keys(oldScopes).sort(),
    "Upgrade changed the set of API keys",
  );
  const keyId = (name) => {
    const match = /^ktyx_(?:test|live)_([^_]+)_.+$/.exec(env[name] ?? "");
    assert.ok(match, `Missing or invalid ${name} in upgrade fixture`);
    return match[1];
  };
  const telemetry = keyId("KORTYX_TELEMETRY_API_KEY");
  const studio = keyId("KORTYX_STUDIO_API_KEY");
  assert.notEqual(
    telemetry,
    studio,
    "Upgrade fixture requires separate SDK and Studio keys",
  );
  assert.ok(
    Object.hasOwn(oldScopes, telemetry) && Object.hasOwn(oldScopes, studio),
    "Managed fixture keys are missing",
  );
  const prompts = nativeCapabilities || env.KORTYX_STUDIO_ENABLE_PROMPTS !== "0";
  // Prompt management (#288) intentionally expands only the two installer-owned
  // bootstrap keys. Studio 0.21 also enables diagnostics:read and makes prompts
  // unconditional (#336). Older release recovery must retain its old contract.
  // All other keys retain exactly their previous scopes.
  for (const [id, scopes] of Object.entries(oldScopes)) {
    const additions = !prompts
      ? []
      : id === telemetry
        ? ["prompt:serve"]
        : id === studio
          ? [
              "studio:write",
              "prompt:promote",
              "prompt:review",
              "prompt:settings",
            ]
          : [];
    if (nativeCapabilities && id === studio) additions.push("diagnostics:read");
    assert.deepEqual(
      [...new Set(newScopes[id])].sort(),
      [...new Set([...scopes, ...additions])].sort(),
      `Unexpected scope change for upgrade fixture key ${id}`,
    );
  }
}

module.exports = { verifyUpgrade };
if (require.main === module) {
  try {
    verifyUpgrade(
      JSON.parse(readFileSync(process.argv[2], "utf8")),
      JSON.parse(readFileSync(process.argv[3], "utf8")),
      parseEnv(readFileSync(process.argv[4], "utf8")),
      process.argv[5],
    );
    console.log(
      "Verified unchanged customer data and credential identities, with only versioned managed capability scopes added.",
    );
  } catch (error) {
    // Do not serialize snapshots or credential environment contents into CI logs.
    console.error(error.message.split("\n")[0]);
    process.exitCode = 1;
  }
}
