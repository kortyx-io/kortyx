import "server-only";

import { google } from "@kortyx/google";
import { useInterrupt, useReason } from "kortyx";
import type { z } from "zod";
import {
  PICK_AGENT_INTERRUPT_ID,
  PICK_BRIEF_INTERRUPT_ID,
} from "@/lib/protocol";
import {
  pickerRequestSchema,
  pickerResponseSchema,
} from "@/schemas/interrupts";
import type { EntityCandidate } from "../lib/search-entities";
import { localizedAmbiguityItem } from "../resolvers/picker-item";

export type EntityKind = "brief" | "agent";

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
  const interruptId = pickerInterruptId(args.what);

  const question = await localizedAmbiguityItem({
    id: `pick-${args.what}-ambiguity-question`,
    what: args.what,
    query: args.query,
  });

  const selected = await useInterrupt({
    id: interruptId,
    request: {
      // `choice` (not `text`) so kortyx's chat.send doesn't auto-route a
      // plain chat-input submission as the interrupt response — the picker
      // UI calls respondToInterrupt explicitly; everything else is a new
      // chat turn that re-classifies. Options is intentionally empty: the
      // client renders an AsyncSearchSelect against `meta.candidates` (and
      // a server-action search), not a static option list. See
      // schemas/interrupts.ts.
      kind: "choice",
      question,
      options: [],
      schemaId: interruptId,
      schemaVersion: "1",
      meta: {
        prefillQuery: args.query,
        candidates: args.candidates satisfies EntityCandidate[],
      },
    },
  });

  const id = Array.isArray(selected) ? selected[0] : selected;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`pickEntity: missing interrupt response for ${args.what}`);
  }
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
  const interruptId = pickerInterruptId(args.what);

  // Split question generation from the interrupt so resume only replays
  // the user's pick — `useReason({ interrupt })` always runs a continuation
  // LLM pass after the pick, which added ~15s of dead air before any stream
  // events on brief-query resume.
  const questionResult = await useReason<z.infer<typeof pickerRequestSchema>>({
    id: `${interruptId}-question`,
    model: google("gemini-2.5-flash"),
    system: buildGenericPickerSystem({
      what: args.what,
      ...(args.contextHint ? { contextHint: args.contextHint } : {}),
    }),
    input:
      args.what === "brief"
        ? "Generate the question asking which discovery brief to use."
        : "Generate the question asking which facilitator agent to use.",
    outputSchema: pickerRequestSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  const request = questionResult.output;
  if (!request?.question?.trim()) {
    throw new Error(
      `pickEntity: generic picker question generation failed for ${args.what}`,
    );
  }

  const selected = await useInterrupt({
    id: interruptId,
    request: {
      kind: request.kind,
      question: request.question,
      options: request.options,
      schemaId: interruptId,
      schemaVersion: "1",
    },
    responseSchema: pickerResponseSchema,
  });

  const id = Array.isArray(selected) ? selected[0] : selected;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`pickEntity: missing interrupt response for ${args.what}`);
  }
  return id;
}

function buildGenericPickerSystem(args: {
  what: EntityKind;
  contextHint?: string;
}): string {
  const subject =
    args.what === "brief" ? "a discovery brief" : "a facilitator agent";

  return [
    "You are the Canvas Agent helping an user.",
    `Write ONE short, natural question (max 20 words) asking the user which ${subject} they want.`,
    "Use the provided context to phrase the question appropriately. Do NOT assume a canvas-generation framing when the context says otherwise.",
    'Always set `kind` to "choice", set `question`, and leave `options` as an empty array — the UI renders its own search picker, not a static option list.',
    "Return JSON only matching the requested schema.",
    args.contextHint ? `Context: ${args.contextHint}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
