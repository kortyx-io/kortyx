import { expect, it } from "vitest";
import { Providers } from "./providers";

it("grows route progress from an anchored left edge", () => {
  const progress = Providers({ children: null });

  expect(progress.props.delay).toBe(0);
  expect(progress.props.height).toBe("3px");
  expect(progress.props.stopDelay).toBe(200);
  expect(progress.props.style).toContain("width: 100%");
  expect(progress.props.options).toMatchObject({ positionUsing: "width" });
});
