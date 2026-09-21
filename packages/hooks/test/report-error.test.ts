// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hook.
import { describe, expect, it, vi } from "vitest";
import { runWithHookContext } from "../src/context";
import { reportError } from "../src/report-error";
import type { ReasonTraceAdapter } from "../src/tracing";
import { createNode, createState } from "./helpers";

describe("reportError", () => {
  it("reports a handled error without changing workflow execution", async () => {
    const error = new Error("candidate missing");
    const report = vi.fn();
    const trace: ReasonTraceAdapter = {
      startSpan: () => undefined,
      reportError: report,
    };
    const result = await runWithHookContext(
      { node: createNode().node, state: createState(), reasonTrace: trace },
      async () => {
        reportError(error, {
          severity: "warning",
          metadata: { candidateCount: 2 },
          tags: ["brief"],
        });
        return "continued";
      },
    );

    expect(result.result).toBe("continued");
    expect(report).toHaveBeenCalledWith(error, {
      severity: "warning",
      metadata: { candidateCount: 2 },
      tags: ["brief"],
    });
  });

  it("never lets an observer failure affect execution", async () => {
    const trace: ReasonTraceAdapter = {
      startSpan: () => undefined,
      reportError: () => {
        throw new Error("observer unavailable");
      },
    };
    const result = await runWithHookContext(
      { node: createNode().node, state: createState(), reasonTrace: trace },
      async () => {
        reportError(new Error("handled"));
        return "continued";
      },
    );

    expect(result.result).toBe("continued");
    expect(() => reportError(new Error("outside workflow"))).not.toThrow();
  });
});
