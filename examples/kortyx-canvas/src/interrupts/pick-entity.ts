import "server-only";

import { google } from "@kortyx/google";
import { defineInterruptContract, useReason } from "kortyx";
import {
  PICK_AGENT_INTERRUPT_ID,
  PICK_BRIEF_INTERRUPT_ID,
} from "@/lib/protocol";
import {
  pickerRequestSchema,
  pickerResponseSchema,
} from "@/schemas/interrupts";
import type { EntityCandidate } from "../lib/search-entities";

export type EntityKind = "brief" | "agent";

const briefPicker = defineInterruptContract({
  description:
    "Ask the user to choose a discovery brief from model-provided candidates or search for another brief.",
  schemaId: PICK_BRIEF_INTERRUPT_ID,
  schemaVersion: "2",
  requestSchema: pickerRequestSchema,
  responseSchema: pickerResponseSchema,
});

const agentPicker = defineInterruptContract({
  description:
    "Ask the user to choose a facilitator agent from model-provided candidates or search for another agent.",
  schemaId: PICK_AGENT_INTERRUPT_ID,
  schemaVersion: "2",
  requestSchema: pickerRequestSchema,
  responseSchema: pickerResponseSchema,
});

const pickerContracts = { briefPicker, agentPicker } as const;

/** Maps the entity kind to the canonical interrupt id seen by the client. */
export function pickerInterruptId(what: EntityKind): string {
  return what === "brief" ? PICK_BRIEF_INTERRUPT_ID : PICK_AGENT_INTERRUPT_ID;
}

/**
 * Renders a shortlist picker above a free-text search box. The user
 * sees the LLM's candidate matches and can either pick one or keep
 * searching. Resolves to the `{ id, label }` of whatever they choose; the
 * label is `undefined` when the client returns an id that wasn't in our
 * shortlist (the picker UI allows free-text searches too).
 */
export async function askCandidatePicker(args: {
  what: EntityKind;
  query: string;
  candidates: EntityCandidate[];
}): Promise<{ id: string; label: string | undefined }> {
  const labelById = new Map(args.candidates.map((c) => [c.id, c.label]));
  const id = await askModelPicker({
    what: args.what,
    candidates: args.candidates,
    contextHint: `The search query was "${args.query}" and matched several results. Ask the user to choose one of the supplied candidates or search for another.`,
  });
  return { id, label: labelById.get(id) };
}

/**
 * Falls back to the generic LLM-generated picker item when we have no
 * candidate shortlist (resolver returned `unclear` or `pick_new`). The
 * client renders its default search picker.
 */
export async function askGenericPicker(args: {
  what: EntityKind;
  /**
   * Free-text hint describing why the picker is being shown (e.g. "the
   * user is asking for info about a brief" or "the user is setting up
   * a Product Discovery Canvas"). The LLM uses this to phrase the item
   * appropriately — no deterministic branching here.
   */
  contextHint?: string;
}): Promise<string> {
  return askModelPicker({
    what: args.what,
    candidates: [],
    ...(args.contextHint ? { contextHint: args.contextHint } : {}),
  });
}

/**
 * Runs one durable reasoning operation with both Canvas picker contracts.
 * The model chooses the contract matching `what`, Kortyx pauses at the
 * generated request, and the selected id is returned to the same operation
 * as that control tool's result. The response is read from interrupt history
 * after the continuation completes; application code does not own a replay
 * loop or a separate `useInterrupt` checkpoint.
 */
async function askModelPicker(args: {
  what: EntityKind;
  candidates: EntityCandidate[];
  contextHint?: string;
}): Promise<string> {
  const interruptId = pickerInterruptId(args.what);
  const expectedContract =
    args.what === "brief" ? "briefPicker" : "agentPicker";
  const result = await useReason({
    id: `${interruptId}-reason`,
    model: google("gemini-2.5-flash"),
    system: buildPickerSystem({
      what: args.what,
      ...(args.contextHint ? { contextHint: args.contextHint } : {}),
    }),
    input: [
      `Request the ${args.what} selection now.`,
      `Candidates (copy these exactly into the request): ${JSON.stringify(args.candidates)}`,
      "After the human response arrives, acknowledge it briefly and finish without requesting input again.",
    ].join("\n"),
    interrupts: {
      mode: "required",
      maxRequests: 1,
      contracts: pickerContracts,
    },
    toolExecution: { maxSteps: 3, approval: false, emit: true },
    emit: false,
  });

  const history = result.interruptHistory as
    | Array<{ contract: keyof typeof pickerContracts; response: string }>
    | undefined;
  const response = history?.find(
    (entry) => entry.contract === expectedContract,
  )?.response;
  if (typeof response !== "string" || response.length === 0) {
    throw new Error(
      `pickEntity: missing ${expectedContract} response for ${args.what}`,
    );
  }
  return response;
}

function buildPickerSystem(args: {
  what: EntityKind;
  contextHint?: string;
}): string {
  const subject =
    args.what === "brief" ? "a discovery brief" : "a facilitator agent";
  const expectedContract =
    args.what === "brief" ? "briefPicker" : "agentPicker";

  return [
    "You are the Canvas Agent helping an user.",
    `You must call the ${expectedContract} human-input contract, not the other picker contract.`,
    `Write one short, natural question (max 20 words) asking which ${subject} the user wants.`,
    "Use the provided context to phrase the question appropriately. Do NOT assume a canvas-generation framing when the context says otherwise.",
    'Set `kind` to "choice", set `question`, leave `options` empty, and copy the supplied `candidates` exactly. The UI renders its own search picker.',
    "After the contract returns a selected id, finish. Never request human input a second time.",
    args.contextHint ? `Context: ${args.contextHint}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
