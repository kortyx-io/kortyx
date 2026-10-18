import { createHash } from "node:crypto";
import {
  canonicalPromptJson,
  PromptContentSchema,
} from "@kortyx/prompts/browser";
import {
  PromptDetailSchema,
  PromptLibrarySchema,
  SAMPLE_PROJECT as sample,
} from "@kortyx/telemetry-contracts";

const definitions = [
  {
    promptId: sample.promptId,
    key: "support/assistant",
    name: "Support assistant",
    versions: [
      "Help with order questions and resolution requests. Delegate shipment questions to order research and credit questions to the resolution specialist. Return a short answer based on their findings.",
      "You coordinate a small support team. Ask order research for shipment facts and resolution review for credit options. Pass verified order references between specialists. State the shipment status and label carrier dates as estimates. Ask a human to approve every credit; never promise one before approval. Keep replies brief and say when evidence is missing.",
      "You coordinate order research and resolution review. Route only the work needed for the current question; a specialist returns its evidence before you compose the reply. Carry verified order references and delivery notes into follow-ups. Report shipment state and label carrier dates as estimates. Give the exact location of a requested delivery note. Before a credit, show the order, amount, and proposed action for review. Apply only an approved proposal; honor a decline without changing the order. If a lookup fails, state what remains unknown. Use one bounded retry for a transient fault. Return a few useful sentences, without internal IDs or tool narration.",
    ],
    notes: [
      "Initial delegation prompt; review and evidence rules are incomplete.",
      "Add review gating and qualified delivery estimates.",
      "Locate delivery notes, preserve verified context, and bound retries.",
    ],
  },
  {
    promptId: "10000000-0000-4000-8000-000000000040",
    key: "support/order-research",
    name: "Order research specialist",
    versions: [
      "Read orders with readParcel and delivery notes with readDeliveryNote. Return a short summary to the coordinator.",
      "Use readParcel for shipment state and readDeliveryNote for signature requirements. Discover an order from its receipt reference before reading details. Return verified facts, the matched reference, and any uncertainty. Do not describe an estimated carrier date as a guarantee.",
      "Read shipment facts with readParcel and signature requirements with readDeliveryNote. Resolve the receipt reference before fetching details; preserve it for follow-up questions. For a delivery-note question, return the exact navigation location. If nothing matches, ask for the receipt reference. If several matches remain, present distinguishable choices. Retry a transient lookup once; report a malformed response as missing evidence. Return concise facts and uncertainty to the coordinator. You cannot create credits.",
    ],
    notes: [
      "Initial read specialist.",
      "Require matched references and honest estimates.",
      "Add precise note locations and bounded recovery.",
    ],
  },
  {
    promptId: "10000000-0000-4000-8000-000000000041",
    key: "support/resolution-review",
    name: "Resolution review specialist",
    versions: [
      "Check resolution options with checkReturnWindow. Use prepareCredit for a reviewed request. Return the result to the coordinator.",
      "Read the existing resolution options with checkReturnWindow. Before prepareCredit, request a human review showing the matched order and credit amount. Pause until the review is answered. A decline creates nothing. After approval, apply the reviewed proposal once and report the recorded result.",
      "Use checkReturnWindow to read existing resolution options. Show the order reference, amount, currency, and exact proposed action in a credit review. Pause until the reviewer responds. After approval, use prepareCredit once for that review; reuse completed reads on resume. A decline or cancellation creates nothing. Treat a duplicate-review denial as an unchanged order, not a new credit. Never claim completion from a pending or failed resume. Return the verified outcome and next step to the coordinator.",
    ],
    notes: [
      "Initial resolution specialist.",
      "Require explicit review before credit creation.",
      "Clarify review payloads, replay, declines, and duplicate denials.",
    ],
  },
];
const createdAt = (version: number) =>
  new Date(
    Date.parse(sample.recordedAt) - (4 - version) * 600_000,
  ).toISOString();

export function createSamplePrompts() {
  const details = definitions.map((definition) => {
    const versions = definition.versions.map((system, index) => {
      const content = PromptContentSchema.parse({
        format: "system-user",
        messages: [
          { role: "system", content: system },
          { role: "user", content: "{{question}}" },
        ],
        variablesSchema: {
          type: "object",
          properties: { question: { type: "string" } },
          required: ["question"],
          additionalProperties: false,
        },
        configSchema: { type: "object" },
        config: {},
        dependencies: [],
      });
      return {
        id: definition.key,
        version: index + 1,
        hash: createHash("sha256")
          .update(canonicalPromptJson(content))
          .digest("hex"),
        content,
        promptId: definition.promptId,
        note: definition.notes[index],
        author: "Kortyx sample",
        createdAt: createdAt(index + 1),
        origin: null,
      };
    });
    const asset = {
      id: definition.promptId,
      key: definition.key,
      name: definition.name,
      categoryId: null,
      latestVersion: 3,
      revision: 3,
      archived: false,
      updatedAt: createdAt(3),
      assignments: [
        { tag: "live", version: 3, revision: 1, updatedAt: createdAt(3) },
      ],
    };
    return PromptDetailSchema.parse({
      asset,
      versions,
      draft: null,
      draftBase: null,
      draftRevision: 0,
      evidence: [],
      usage: [],
      activity: [],
      policies: [],
    });
  });
  return {
    library: PromptLibrarySchema.parse({
      schemaVersion: 1,
      assets: details.map((detail) => detail.asset),
      categories: [],
      groups: [],
      totalCount: details.length,
      nextCursor: null,
      permissions: {
        edit: false,
        promote: false,
        review: false,
        settings: false,
      },
    }),
    detail: required(details[0]),
    details,
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Incomplete sample fixture relationship.");
  return value;
}
