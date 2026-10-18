// @vitest-environment jsdom
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkflowQuery } from "./use-workflow-query";

let root: Root;
let container: HTMLDivElement;
function Probe() {
  const { params, selection } = useWorkflowQuery([]);
  return (
    <output>{JSON.stringify({ workflow: params.workflow, selection })}</output>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("does not inject a workflow filter when opening an unfiltered catalog", async () => {
  const onUrlUpdate = vi.fn();
  await act(async () =>
    root.render(
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>
        <Probe />
      </NuqsTestingAdapter>,
    ),
  );
  expect(JSON.parse(container.textContent ?? "")).toEqual({
    workflow: "",
    selection: { type: "workflow", id: "" },
  });
  expect(onUrlUpdate).not.toHaveBeenCalled();
});
it("preserves an explicit workflow and node deep link", async () => {
  await act(async () =>
    root.render(
      <NuqsTestingAdapter searchParams="?workflow=sample-order-research&node=research">
        <Probe />
      </NuqsTestingAdapter>,
    ),
  );
  expect(JSON.parse(container.textContent ?? "")).toEqual({
    workflow: "sample-order-research",
    selection: {
      type: "node",
      workflowId: "sample-order-research",
      id: "research",
    },
  });
});
