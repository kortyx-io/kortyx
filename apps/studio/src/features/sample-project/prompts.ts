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

export function createSamplePrompts() {
  const versions = [1, 2].map((version) => {
    const content = PromptContentSchema.parse({
      format: "system-user",
      messages: [
        {
          role: "system",
          content:
            version === 1
              ? "Help customers with orders. Use lookupOrder to check order status."
              : "Help customers with orders. Use lookupOrder to check order status. Ask a human to approve every refund; never promise a refund before approval.",
        },
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
      id: "support/assistant",
      version,
      hash: createHash("sha256")
        .update(canonicalPromptJson(content))
        .digest("hex"),
      content,
      promptId: sample.promptId,
      note:
        version === 1
          ? "Initial sample support prompt."
          : "Require human approval for refunds.",
      author: "Kortyx sample",
      createdAt: sample.recordedAt,
      origin: null,
    };
  });
  const asset = {
    id: sample.promptId,
    key: "support/assistant",
    name: "Support assistant",
    categoryId: null,
    latestVersion: 2,
    revision: 2,
    archived: false,
    updatedAt: sample.recordedAt,
    assignments: [
      { tag: "live", version: 2, revision: 1, updatedAt: sample.recordedAt },
    ],
  };
  return {
    library: PromptLibrarySchema.parse({
      schemaVersion: 1,
      assets: [asset],
      categories: [],
      groups: [],
      totalCount: 1,
      nextCursor: null,
      permissions: {
        edit: false,
        promote: false,
        review: false,
        settings: false,
      },
    }),
    detail: PromptDetailSchema.parse({
      asset,
      versions,
      draft: null,
      draftBase: null,
      draftRevision: 0,
      evidence: [],
      usage: [],
      activity: [],
      policies: [],
    }),
  };
}
