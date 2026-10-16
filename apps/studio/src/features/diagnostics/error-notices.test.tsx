// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const { feature, select } = vi.hoisted(() => ({
  feature: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@/usage/client", () => ({ studioFeature: feature }));
vi.mock("@/lib/nuqs", () => ({ useStudioQueryState: () => [null, select] }));
vi.mock("./use-diagnostic-content", () => ({
  usePreloadDiagnostic: () => () => {},
}));
vi.mock("./error-details", () => ({ ErrorDetails: () => null }));

import { ErrorNotices } from "./error-notices";

it("records deliberate diagnostic inspection once without messages, identifiers or URL data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <ErrorNotices
          environment="production"
          items={[
            {
              id: "private-id",
              severity: "error",
              code: "private-code",
              message: "private-message",
              diagnosticId: "private-diagnostic",
            },
          ]}
        />,
      ),
    );
    expect(feature).not.toHaveBeenCalled();
    await act(async () => container.querySelector("button")?.click());
    expect(select).toHaveBeenCalledWith("private-id");
    expect(feature).toHaveBeenCalledExactlyOnceWith("studio.diagnostic", {
      action: "inspect",
      resource: "diagnostics",
    });
    expect(JSON.stringify(feature.mock.calls)).not.toContain("private");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
