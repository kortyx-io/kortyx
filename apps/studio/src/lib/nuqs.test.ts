import { describe, expect, it } from "vitest";
import { detailNavigationHref, filterPanelParamChanges } from "./nuqs";

describe("detailNavigationHref", () => {
  it("preserves list state while removing panel and stale detail UI state", () => {
    const params = new URLSearchParams({
      q: "failed run",
      status: "failed",
      cursor: "20",
      filterPanel: "true",
      tab: "trace",
      trace: "event-1",
      event: "event-2",
      detailView: "expanded",
    });

    expect(detailNavigationHref("/runs/run-2", params)).toBe(
      "/runs/run-2?q=failed+run&status=failed&cursor=20",
    );
  });

  it("does not add an empty query string", () => {
    expect(
      detailNavigationHref(
        "/sessions/session-1",
        new URLSearchParams("filterPanel=true"),
      ),
    ).toBe("/sessions/session-1");
  });

  it("preserves parent entity tab state while opening a child detail", () => {
    const params = new URLSearchParams({
      sessionTab: "runs",
      tab: "trace",
      trace: "event-1",
    });

    expect(detailNavigationHref("/runs/run-2", params)).toBe(
      "/runs/run-2?sessionTab=runs",
    );
  });
});

describe("filter panel URL state", () => {
  it("maps visibility to a nullable query value", () => {
    expect(filterPanelParamChanges(true)).toEqual({ filterPanel: true });
    expect(filterPanelParamChanges(false)).toEqual({ filterPanel: null });
  });
});
