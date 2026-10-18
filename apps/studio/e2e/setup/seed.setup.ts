import { test as setup } from "@playwright/test";
import { cleanupEvalFixture, seedEvalFixture } from "../support/eval-fixture";
import { seedNavigationFixtures } from "../support/navigation-fixture";
import {
  cleanupDrawerFixture,
  seedDrawerFixture,
} from "../support/telemetry-fixture";

setup("seed deterministic drawer-stack telemetry", async ({ request }) => {
  await cleanupEvalFixture();
  await cleanupDrawerFixture();
  await seedDrawerFixture(request);
  await seedNavigationFixtures(request);
  await seedEvalFixture();
});
