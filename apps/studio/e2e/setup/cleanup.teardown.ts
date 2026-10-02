import { test as teardown } from "@playwright/test";
import { cleanupEvalFixture } from "../support/eval-fixture";
import { cleanupDrawerFixture } from "../support/telemetry-fixture";

teardown("remove deterministic drawer-stack telemetry", async () => {
  await cleanupEvalFixture();
  await cleanupDrawerFixture();
});
