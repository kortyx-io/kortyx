import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { getBriefById, getLocalizedBriefContent } from "@/services/demo-data";
import { loadPrompt } from "../../prompts/_registry";
import { emitBriefPreview } from "../../streaming/brief-preview";

const DEMO_LANGUAGE = "en";

type DescribeBriefNodeInput = {
  briefId?: string;
  briefTitle?: string;
};

type DescribeBriefNodeParams = {
  temperature?: number;
};

/**
 * Second step of the brief-query workflow. Loads the demo brief content and
 * streams a short, focused description back to the chat —
 * enough for the user to recognise the brief and for follow-up
 * items to be answered from history by general-chat without another
 * DB hit.
 */
export const describeBriefNode = async ({
  input,
  params,
}: {
  input: DescribeBriefNodeInput;
  params: DescribeBriefNodeParams;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  if (!ctx.tenantId) {
    throw new Error("describeBriefNode: missing tenantId in runtime context");
  }
  if (!input?.briefId) {
    throw new Error("describeBriefNode: missing briefId on input");
  }

  const result = await getBriefById(ctx.tenantId, input.briefId);
  if (result.error || !result.data) {
    throw new Error(
      `describeBriefNode: failed to load brief ${input.briefId}: ${
        result.error ?? "not found"
      }`,
    );
  }

  const brief = result.data;
  const localized = getLocalizedBriefContent(brief.translations, DEMO_LANGUAGE);
  const title = localized.title || input.briefTitle || "this brief";
  const description = localized.description?.trim() || "";

  if (description.length === 0) {
    return await streamFallback({ title });
  }

  const { system, user } = loadPrompt("describe-brief.standard", {
    title,
    description,
  });

  await useReason({
    id: "describe-brief",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params?.temperature ?? 0.3,
    stream: true,
    emit: true,
  });

  emitBriefPreview({
    id: input.briefId,
    title: localized.title || title,
    companyName: localized.companyName,
    description: localized.description,
  });

  return { data: { briefId: input.briefId, briefTitle: title } };
};

async function streamFallback(args: { title: string }) {
  const { system, user } = loadPrompt("describe-brief.fallback", {
    title: args.title,
  });
  await useReason({
    id: "describe-brief-fallback",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    stream: true,
    emit: true,
  });
  return { data: { briefId: "", briefTitle: args.title } };
}
