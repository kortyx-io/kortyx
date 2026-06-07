import "server-only";

import { useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import {
  getAgentById,
  getBriefById,
  getLocalizedBriefContent,
  getTenant,
  getTenantSettings,
  listFacilitatorStyles,
} from "@/services/demo-data";
import { formatFacilitatorStylesForPrompt } from "../../lib/format-facilitator-styles";
import type { CreateDiscoveryCanvasPromptVariables } from "../../prompts/create-canvas";

const DEMO_LANGUAGE = "en";

type FetchDiscoveryCanvasInputsNodeInput = {
  briefId?: string;
  agentId?: string;
};

/**
 * Loads everything the canvas-generation prompt needs (brief, agent, tenant)
 * based on the IDs resolved upstream by `collectDiscoveryCanvasInputsNode` and the
 * server-derived `tenantId` from runtime context. Emits a fully-resolved
 * `promptVars` object on workflow state.
 *
 * Errors are surfaced by throwing. The workflow node's
 * `onError: emit-and-stop` behavior catches the throw, streams an `error`
 * chunk to the client, and halts the workflow cleanly.
 */
export const fetchDiscoveryCanvasInputsNode = async ({
  input,
}: {
  input: FetchDiscoveryCanvasInputsNodeInput;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const briefId = input?.briefId;
  const agentId = input?.agentId;

  if (!ctx.tenantId) {
    throw new Error(
      "fetchDiscoveryCanvasInputsNode: missing tenantId in runtime context",
    );
  }
  if (!briefId) {
    throw new Error("fetchDiscoveryCanvasInputsNode: missing briefId on input");
  }

  const [jobResult, agentResult, tenantResult, facilitatorStylesResult] =
    await Promise.all([
      getBriefById(ctx.tenantId, briefId),
      agentId ? getAgentById(ctx.tenantId, agentId) : Promise.resolve(null),
      getTenant(ctx.tenantId),
      listFacilitatorStyles(ctx.tenantId, { includeArchived: false }),
    ]);

  if (jobResult.error || !jobResult.data) {
    throw new Error(
      `fetchDiscoveryCanvasInputsNode: failed to load brief ${briefId}: ${
        jobResult.error ?? "not found"
      }`,
    );
  }
  if (tenantResult.error || !tenantResult.data) {
    throw new Error(
      `fetchDiscoveryCanvasInputsNode: failed to load tenant ${ctx.tenantId}: ${
        tenantResult.error ?? "not found"
      }`,
    );
  }

  const brief = jobResult.data;
  const agent = agentResult && !agentResult.error ? agentResult.data : null;
  const tenantSettings = getTenantSettings(tenantResult.data);
  const localizedJob = getLocalizedBriefContent(
    brief.translations,
    DEMO_LANGUAGE,
  );

  // FacilitatorStyle load is best-effort: an empty/failed list still produces a valid
  // prompt — the model will write `null` for `facilitator_style_id` and the canvas
  // user can pick one manually before save.
  const facilitatorStyles = facilitatorStylesResult.data ?? [];
  const availableFacilitatorStyles =
    formatFacilitatorStylesForPrompt(facilitatorStyles);

  const promptVars: CreateDiscoveryCanvasPromptVariables = {
    agentTitle: agent?.title ?? "Canvas Agent",
    agentTone: agent?.tone ?? "professional",
    agentCustomInstructions: agent?.customInstructions ?? "None",
    companyName:
      localizedJob.companyName ?? tenantSettings.displayName ?? "the company",
    briefTitle: localizedJob.title,
    briefDescription: localizedJob.description ?? "",
    availableFacilitatorStyles,
  };

  console.log("[fetch-canvas-inputs] resolved", {
    briefId,
    briefTitle: promptVars.briefTitle,
    descriptionLength: promptVars.briefDescription.length,
    agentResolved: Boolean(agent),
    facilitatorStyleCount: facilitatorStyles.length,
  });

  return {
    data: { promptVars },
  };
};
