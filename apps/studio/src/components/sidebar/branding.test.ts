import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships the same logo asset as the website navbar without a runtime dependency", () => {
  const studioLogo = readFileSync(
    new URL("../../../public/logo.png", import.meta.url),
  );
  const websiteLogo = readFileSync(
    new URL("../../../../website/public/logo.png", import.meta.url),
  );
  expect(studioLogo.equals(websiteLogo)).toBe(true);
});
