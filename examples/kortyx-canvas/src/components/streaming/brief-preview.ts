import type { ContentPiece } from "@kortyx/react";
import { BRIEF_PREVIEW_DATA_TYPE } from "@/lib/protocol";

export type BriefPreviewChunk = {
  id: string;
  title: string;
  companyName: string | null;
  description: string | null;
};

export function pickBriefPreview(
  piece: ContentPiece,
): BriefPreviewChunk | null {
  if (piece.type !== "structured") return null;
  if (piece.data.dataType !== BRIEF_PREVIEW_DATA_TYPE) return null;
  const data = piece.data.data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.id !== "string" || typeof rec.title !== "string") return null;
  return {
    id: rec.id,
    title: rec.title,
    companyName: typeof rec.companyName === "string" ? rec.companyName : null,
    description: typeof rec.description === "string" ? rec.description : null,
  };
}
