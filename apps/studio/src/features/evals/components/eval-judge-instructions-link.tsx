"use client";

import { FileText } from "lucide-react";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";

export function EvalJudgeInstructionsLink({
  source,
  id,
  context = {},
}: {
  source: "target" | "run";
  id: string;
  context?: Record<string, string>;
}) {
  const search = useSearchParams();
  // Retain the underlying conversation, step and repetition while inspecting
  // its instructions. Other detail links intentionally discard that state.
  const query = new URLSearchParams(search.toString());
  query.delete("detailView");
  for (const [key, value] of Object.entries(context)) query.set(key, value);
  return (
    <Button variant="outline" size="sm" asChild>
      <DetailLink
        data-eval-judge-link
        href={`/evals/judges/${source}/${encodeURIComponent(id)}?${query}`}
        onClick={() =>
          studioFeature("studio.inspect", {
            surface: "evals",
            action: "inspect",
            tab: "definition",
          })
        }
      >
        <FileText />
        Judge instructions
      </DetailLink>
    </Button>
  );
}
