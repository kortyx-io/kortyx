import { test as setup } from "@playwright/test";
import {
  cleanupDrawerFixture,
  seedDrawerFixture,
} from "../support/telemetry-fixture";

setup("seed deterministic drawer-stack telemetry", async ({ request }) => {
  await cleanupDrawerFixture();
  await seedDrawerFixture(request);
});
