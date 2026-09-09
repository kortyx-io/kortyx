import "server-only";

import { defineWorkflow } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { showHelpNode } from "../nodes/canvas-help/show-help-node";

/** A terminal handoff example: /help transfers this turn and does not return. */
export const canvasHelpWorkflow = defineWorkflow({
  id: WORKFLOW_IDS.canvasHelp,
  version: "1.0.0",
  description: "Shows Canvas help when general-chat hands off via /help.",
  nodes: { showHelp: { run: showHelpNode } },
  edges: [
    ["__start__", "showHelp"],
    ["showHelp", "__end__"],
  ],
});
