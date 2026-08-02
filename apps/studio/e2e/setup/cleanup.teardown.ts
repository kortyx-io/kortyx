import { test as teardown } from "@playwright/test";
import { cleanupDrawerFixture } from "../support/telemetry-fixture";

teardown("remove deterministic drawer-stack telemetry", async () => {
  await cleanupDrawerFixture();
});
