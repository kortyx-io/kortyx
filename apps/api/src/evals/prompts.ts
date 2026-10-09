import { PromptError, validatePromptValue } from "@kortyx/prompts";
import type { PromptSelection } from "@kortyx/telemetry-contracts";
import { type PromptScope, resolvePrompts } from "@kortyx/telemetry-db";
import type { ApiTenantDatabase } from "../database/contracts";
import type { fetchEvalManifest } from "./targets";

/** Resolve one atomic baseline shared by every suite in this launch. */
export async function freezeEvalPrompts(
  withDatabase: ApiTenantDatabase,
  scope: PromptScope,
  environment: string,
  registered: Awaited<ReturnType<typeof fetchEvalManifest>>["promptContracts"],
  selection?: PromptSelection,
) {
  const contracts = registered ?? [];
  if (selection && !contracts.length)
    throw new PromptError(
      "PROMPT_EVAL_UNSUPPORTED",
      "This application does not support Studio prompts.",
      409,
    );
  let promptGroupName: string | undefined;
  const promptSnapshot = contracts.length
    ? await withDatabase((db) =>
        resolvePrompts(db, scope, {
          ids: contracts.map((contract) => contract.id),
          environment,
          selection: selection ?? { type: "live" },
          onGroupName: (name) => {
            promptGroupName = name;
          },
        }),
      )
    : undefined;
  if (promptSnapshot)
    for (const contract of contracts) {
      const version = promptSnapshot.versions[contract.id];
      if (!version || version.content.format !== contract.format)
        throw new PromptError(
          "PROMPT_CONTRACT_MISMATCH",
          `Prompt ${contract.id} format differs from this application.`,
          409,
        );
      validatePromptValue(
        contract.configSchema,
        version.content.config,
        `${contract.id} application configuration`,
      );
    }
  return { promptSnapshot, promptGroupName };
}
