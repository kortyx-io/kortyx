import type { discoverWorkflowCalls } from "./workflow-calls";

export function summarizeDiscovery(
  discovered: ReturnType<typeof discoverWorkflowCalls>,
) {
  const unresolvedCallCount = discovered.diagnostics.filter(
    (item) => !item.exemptionReason,
  ).length;
  const exemptCallCount = discovered.diagnostics.length - unresolvedCallCount;
  const gapCount = discovered.discoveryGaps.length;
  return {
    status:
      discovered.diagnostics.length || gapCount ? "incomplete" : "complete",
    resolvedLinkCount: [...discovered.calls.values()].reduce(
      (sum, calls) => sum + calls.length,
      0,
    ),
    unresolvedCallCount,
    exemptCallCount,
    gapCount,
    gaps: discovered.discoveryGaps,
  };
}
