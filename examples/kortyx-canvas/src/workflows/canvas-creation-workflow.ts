import "server-only";

import { defineWorkflow } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { announceDiscoveryCanvasCreationNode } from "../nodes/canvas-creation/announce-canvas-creation-node";
import {
  collectDiscoveryCanvasAgentNode,
  collectDiscoveryCanvasBriefNode,
} from "../nodes/canvas-creation/collect-canvas-inputs-node";
import { createDiscoveryCanvasNode } from "../nodes/canvas-creation/create-canvas-node";
import { fetchDiscoveryCanvasInputsNode } from "../nodes/canvas-creation/fetch-canvas-inputs-node";
import { summarizeDiscoveryCanvasNode } from "../nodes/canvas-creation/summarize-canvas-node";

/**
 * Five-step canvas creation:
 *   1. `collectDiscoveryCanvasBrief` — ensures we have a brief id.
 *   2. `collectDiscoveryCanvasAgent` — ensures we have an agent id.
 *      Missing values are collected via `useInterrupt` choice dropdowns
 *      rendered by the client. They are separate nodes so checkpoint/fork
 *      anchors line up with the currently visible picker.
 *   3. `fetchDiscoveryCanvasInputs` — loads brief/agent/tenant data using the resolved
 *      IDs and writes `promptVars` to workflow state.
 *   4. `announceDiscoveryCanvasCreation` — emits one streamed sentence into chat
 *      naming the agent + brief, so the user sees context before the
 *      thinking pill takes over the next (silent, long-running) node.
 *   5. `createDiscoveryCanvas` — runs the LLM call and emits the canvas
 *      (sent to the canvas as a `structured-data` chunk).
 *   6. `summarizeDiscoveryCanvas` — streams a short 2–3 sentence chat message
 *      describing the just-generated canvas so the user has something
 *      conversational in the chat panel alongside the populated canvas.
 *
 * Errors thrown from any node are caught by Kortyx via the workflow node's
 * `onError: emit-and-stop` behavior, streamed to the client as a structured
 * `error` chunk, and halt the workflow cleanly — no custom soft-error
 * routing required.
 */
export const canvasCreationWorkflow = defineWorkflow({
  id: WORKFLOW_IDS.canvasCreation,
  version: "1.4.0",
  description:
    "Collect brief/agent via interrupts, fetch brief/agent/tenant context, announce the run, generate a Product Discovery Canvas, then summarize it for the user.",
  nodes: {
    collectDiscoveryCanvasBrief: {
      run: collectDiscoveryCanvasBriefNode,
      behavior: {
        onError: { mode: "emit-and-stop" },
      },
    },
    collectDiscoveryCanvasAgent: {
      run: collectDiscoveryCanvasAgentNode,
      behavior: {
        onError: { mode: "emit-and-stop" },
      },
    },
    fetchDiscoveryCanvasInputs: {
      run: fetchDiscoveryCanvasInputsNode,
      behavior: {
        onError: { mode: "emit-and-stop" },
      },
    },
    announceDiscoveryCanvasCreation: {
      run: announceDiscoveryCanvasCreationNode,
      params: {
        temperature: 0.6,
      },
      behavior: {
        onError: { mode: "emit-and-stop" },
      },
    },
    createDiscoveryCanvas: {
      run: createDiscoveryCanvasNode,
      params: {
        temperature: 0.3,
      },
      behavior: {
        onError: { mode: "emit-and-stop" },
      },
    },
    summarizeDiscoveryCanvas: {
      run: summarizeDiscoveryCanvasNode,
      params: {
        temperature: 0.6,
      },
      behavior: {
        onError: { mode: "emit-and-stop" },
      },
    },
  },
  edges: [
    ["__start__", "collectDiscoveryCanvasBrief"],
    ["collectDiscoveryCanvasBrief", "collectDiscoveryCanvasAgent"],
    ["collectDiscoveryCanvasAgent", "fetchDiscoveryCanvasInputs"],
    ["fetchDiscoveryCanvasInputs", "announceDiscoveryCanvasCreation"],
    ["announceDiscoveryCanvasCreation", "createDiscoveryCanvas"],
    ["createDiscoveryCanvas", "summarizeDiscoveryCanvas"],
    ["summarizeDiscoveryCanvas", "__end__"],
  ],
});
