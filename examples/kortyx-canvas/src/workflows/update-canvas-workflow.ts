import "server-only";

import { defineWorkflow } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { acknowledgeUpdateIntentNode } from "../nodes/update-canvas/acknowledge-update-intent-node";
import { addItemNode } from "../nodes/update-canvas/add-item-node";
import { addSectionNode } from "../nodes/update-canvas/add-section-node";
import { applyUpdatesNode } from "../nodes/update-canvas/apply-updates-node";
import { classifyUpdateOpNode } from "../nodes/update-canvas/classify-update-op-node";
import { findUpdatePathsNode } from "../nodes/update-canvas/find-update-paths-node";
import { removeItemNode } from "../nodes/update-canvas/remove-item-node";
import { removeSectionNode } from "../nodes/update-canvas/remove-section-node";
import { respondToPolicyRefusalNode } from "../nodes/update-canvas/respond-to-policy-refusal-node";
import { screenUpdateIntentNode } from "../nodes/update-canvas/screen-update-intent-node";
import { summarizeUpdatesNode } from "../nodes/update-canvas/summarize-updates-node";

/**
 * Forked "update the canvas" workflow.
 *
 *   1. `screenUpdateIntent`     — pre-flight content-policy classifier.
 *                                 Silent. On a block we go straight to the
 *                                 refusal node; on a pass we ack first.
 *   2. `acknowledgeUpdateIntent` — streams ONE short, deliberately vague
 *                                  sentence so the user sees activity
 *                                  before the silent classify + path-find
 *                                  chain runs. Gated by the screen so
 *                                  refused turns never see it. Wording is
 *                                  kept generic on purpose — the workflow
 *                                  can still redirect to `canvas-save` later
 *                                  (when `findUpdatePaths` can't pin down a
 *                                  target), and "taking a look" stays true
 *                                  whichever branch ends up running.
 *   3. `classifyUpdateOp`       — chooses one of five branches based on the
 *                                  user's intent. Returns a `condition`
 *                                  matched against the `{ when }` edges
 *                                  below.
 *
 *   Branch A — update_field (existing string rewrite, streamed progressively):
 *       findUpdatePaths → applyUpdates → summarizeUpdates
 *       findUpdatePaths short-circuits with `transitionTo: canvas-save` when
 *       it can't pin down a target — see `find-update-paths-node.ts`.
 *
 *   Branch B — add_section / remove_section / add_item /
 *              remove_item (atomic structural ops):
 *       <branch node> → summarizeUpdates
 *
 *   Branch P — policy refusal:
 *       respondToPolicyRefusal → __end__
 *
 *   4. `summarizeUpdates`       — reads `data.patches` (DiscoveryCanvasOp[]) and
 *                                  streams a 1-2 sentence chat confirmation.
 *
 * Errors thrown by any node hit `onError: emit-and-stop` and are streamed
 * back to the client as a clean error chunk.
 */
export const updateDiscoveryCanvasWorkflow = defineWorkflow({
  id: WORKFLOW_IDS.updateDiscoveryCanvas,
  version: "2.1.0",
  description:
    "Screen for policy, ack the user, classify into one of five canvas ops (set / add* / remove*), execute the matching branch, then confirm.",
  nodes: {
    screenUpdateIntent: {
      run: screenUpdateIntentNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    acknowledgeUpdateIntent: {
      run: acknowledgeUpdateIntentNode,
      params: { temperature: 0.6 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    respondToPolicyRefusal: {
      run: respondToPolicyRefusalNode,
      params: { temperature: 0.3 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    classifyUpdateOp: {
      run: classifyUpdateOpNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },

    // Branch A — string rewrites
    findUpdatePaths: {
      run: findUpdatePathsNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    applyUpdates: {
      run: applyUpdatesNode,
      params: { temperature: 0.4 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },

    // Branches B-E — structural ops
    addSection: {
      run: addSectionNode,
      params: { temperature: 0.5 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    removeSection: {
      run: removeSectionNode,
      params: { temperature: 0.2 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    addItem: {
      run: addItemNode,
      params: { temperature: 0.5 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    removeItem: {
      run: removeItemNode,
      params: { temperature: 0.2 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },

    summarizeUpdates: {
      run: summarizeUpdatesNode,
      params: { temperature: 0.5 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
  },
  edges: [
    ["__start__", "screenUpdateIntent"],

    // Pre-flight policy fork — refuse straight from the screen so blocked
    // turns produce a single, coherent assistant message. On a pass we
    // first stream a short ack so the user sees the agent is working,
    // THEN proceed into the silent classifier.
    ["screenUpdateIntent", "respondToPolicyRefusal", { when: "blocked" }],
    ["screenUpdateIntent", "acknowledgeUpdateIntent", { when: "ok" }],
    ["acknowledgeUpdateIntent", "classifyUpdateOp"],

    // Fork on `condition` returned by classifyUpdateOp
    ["classifyUpdateOp", "findUpdatePaths", { when: "update_field" }],
    ["classifyUpdateOp", "addSection", { when: "add_section" }],
    ["classifyUpdateOp", "removeSection", { when: "remove_section" }],
    ["classifyUpdateOp", "addItem", { when: "add_item" }],
    ["classifyUpdateOp", "removeItem", { when: "remove_item" }],

    // Each branch funnels into summarizeUpdates. `findUpdatePaths` may
    // also short-circuit via `condition: "redirect"` when it couldn't
    // pin down a target — that route ends the workflow immediately so
    // the `transitionTo: canvas-save` it set takes over without firing
    // `applyUpdates` or `summarizeUpdates` (which would otherwise stream
    // a stale "I couldn't tell which part…" message).
    ["findUpdatePaths", "applyUpdates", { when: "ok" }],
    ["findUpdatePaths", "__end__", { when: "redirect" }],
    ["applyUpdates", "summarizeUpdates"],
    ["addSection", "summarizeUpdates"],
    ["removeSection", "summarizeUpdates"],
    ["addItem", "summarizeUpdates"],
    ["removeItem", "summarizeUpdates"],

    ["summarizeUpdates", "__end__"],
    ["respondToPolicyRefusal", "__end__"],
  ],
});
