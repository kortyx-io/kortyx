import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { EVALUATION_UPDATE_GUARD } from "../src/updater/docker";

const exec = promisify(execFile);
it("checks immutable eval configuration without reading files or printing targets", async () => {
  for (const env of [
    {},
    { KORTYX_EVAL_TARGETS: "[]" },
    { KORTYX_API_EVAL_WORKER_ENABLED: "false" },
  ]) {
    const result = await exec(
      process.execPath,
      ["-e", EVALUATION_UPDATE_GUARD],
      { env },
    );
    expect(result.stdout).toBe("safe-no-evals");
    expect(result.stderr).toBe("");
  }
  for (const env of [
    { KORTYX_EVAL_TARGETS: '[{"serviceKey":"fixture-secret"}]' },
    { KORTYX_EVAL_TARGETS_FILE: "/does-not-exist", KORTYX_EVAL_TARGETS: "[]" },
    { KORTYX_EVAL_TARGETS: "fixture-secret-invalid-json" },
    { KORTYX_EVAL_TARGETS: "{}" },
    { KORTYX_API_DEPLOYMENT: "cloud" },
    { KORTYX_API_EVAL_WORKER_ENABLED: "false", KORTYX_EVAL_TARGETS: "[{}]" },
  ]) {
    await expect(
      exec(process.execPath, ["-e", EVALUATION_UPDATE_GUARD], { env }),
    ).rejects.toMatchObject({ code: 1, stdout: "", stderr: "" });
  }
});
