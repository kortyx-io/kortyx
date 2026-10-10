import {
  PromptBundleSchema,
  PromptDetailSchema,
  PromptLibrarySchema,
  type PromptMutation,
  PromptMutationSchema,
  type PromptTransferRequest,
  PromptTransferRequestSchema,
} from "@kortyx/telemetry-contracts";
import { z } from "zod";
import { StudioApiTransport } from "./read-client";
export class StudioPromptClient extends StudioApiTransport {
  async verifyTransfer(result: Record<string, unknown>) {
    const mapping = z
      .array(
        z.object({
          promptId: z.uuid(),
          version: z.number().int().positive(),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .parse(result.mapping);
    const details = new Map<
      string,
      Awaited<ReturnType<StudioPromptClient["get"]>>
    >();
    for (const item of mapping) {
      let detail = details.get(`${item.promptId}@${item.version}`);
      if (!detail) {
        detail = await this.get(item.promptId, {
          byKey: false,
          version: item.version,
        });
        details.set(`${item.promptId}@${item.version}`, detail);
      }
      if (
        !detail.versions.some(
          (version) =>
            version.version === item.version && version.hash === item.hash,
        )
      )
        throw new Error(
          "Destination read-back verification failed. Keep the saved plan and retry apply.",
        );
    }
    return { ...result, verified: true, verification: "destination-read-back" };
  }
  list(query: Record<string, string> = {}) {
    return this.requestJson(
      "GET",
      "/v1/studio/prompts",
      PromptLibrarySchema,
      query,
    );
  }
  get(
    id: string,
    options: {
      byKey?: boolean;
      version?: number;
      versionsCursor?: string;
    } = {},
  ) {
    return this.requestJson(
      "GET",
      `/v1/studio/prompts/assets/${encodeURIComponent(id)}`,
      PromptDetailSchema,
      {
        ...(options.byKey !== false ? { lookup: "key" } : {}),
        ...(options.version ? { version: String(options.version) } : {}),
        ...(options.versionsCursor
          ? { versionsCursor: options.versionsCursor }
          : {}),
      },
    );
  }
  mutate(input: PromptMutation) {
    return this.requestJson(
      "POST",
      "/v1/studio/prompts/actions",
      z.record(z.string(), z.unknown()),
      {},
      PromptMutationSchema.parse(input),
    );
  }
  export(options: {
    keys: string[];
    versions?: Record<string, number>;
    history?: boolean;
    groups?: boolean;
  }) {
    return this.requestJson(
      "POST",
      "/v1/studio/prompts/export",
      PromptBundleSchema,
      {},
      { ...options, apiUrl: this.apiUrl },
    );
  }
  plan(input: PromptTransferRequest) {
    return this.requestJson(
      "POST",
      "/v1/studio/prompts/transfers/plan",
      z.object({
        id: z.uuid(),
        bundleHash: z.string(),
        expiresAt: z.string(),
        mapping: z.array(z.record(z.string(), z.unknown())),
        assignmentsChanged: z.literal(false),
      }),
      {},
      PromptTransferRequestSchema.parse(input),
    );
  }
  async apply(id: string, bundleHash: string) {
    const result = await this.requestJson(
      "POST",
      `/v1/studio/prompts/transfers/${z.uuid().parse(id)}/apply`,
      z.record(z.string(), z.unknown()),
      {},
      { bundleHash },
    );
    return this.verifyTransfer(result);
  }
}
