import "server-only";

import { useStructuredData } from "kortyx";
import { BRIEF_PREVIEW_DATA_TYPE } from "@/lib/protocol";

export type BriefPreviewPayload = {
  id: string;
  title: string;
  companyName: string | null;
  description: string | null;
};

/**
 * Streams the resolved brief's canonical demo content into chat after the
 * `describeBrief` text summary finishes, so the user sees a structured card
 * with title, company, and full description.
 */
export function emitBriefPreview(args: BriefPreviewPayload): void {
  useStructuredData({
    id: `brief-preview-${args.id}`,
    streamId: "brief-preview",
    dataType: BRIEF_PREVIEW_DATA_TYPE,
    data: {
      id: args.id,
      title: args.title,
      companyName: args.companyName,
      description: args.description,
    },
  });
}
