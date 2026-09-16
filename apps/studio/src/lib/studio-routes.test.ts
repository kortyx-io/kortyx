import { describe, expect, it } from "vitest";
import { studioDetailHref, studioRouteId } from "./studio-routes";

describe("Studio entity navigation", () => {
  for (const resource of ["runs", "sessions", "interrupts"] as const) {
    it.each([
      "session-uuid",
      "owner-hash:uuid",
      "id/with?delimiters#fragment",
      "literal%3Aescape",
      "literal%253Aescape",
      "a%broken",
      "é space+plus",
    ])(`round-trips ${resource} ID %s without changing its value`, (id) => {
      const href = studioDetailHref(resource, id);
      const url = new URL(href, "https://studio.example");
      expect(url.pathname.split("/")).toHaveLength(3);
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(studioRouteId(url.pathname.split("/")[2] ?? "")).toBe(id);
    });
  }

  it("keeps child selections separate from the entity path", () => {
    const url = new URL(
      studioDetailHref("runs", "run:/?#", {
        tab: "calls",
        call: "invocation:/?#%3A",
        branch: "branch:/?#",
      }),
      "https://studio.example",
    );
    expect(studioRouteId(url.pathname.split("/")[2] ?? "")).toBe("run:/?#");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tab: "calls",
      call: "invocation:/?#%3A",
      branch: "branch:/?#",
    });
  });
});
