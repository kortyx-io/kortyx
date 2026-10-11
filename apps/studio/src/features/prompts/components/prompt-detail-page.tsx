import { notFound } from "next/navigation";
import { readEvalTargets } from "@/features/evals/api/server";
import { readPromptDetail, readPromptLibrary } from "../api/server";
import { PromptDetailView } from "./prompt-detail";
export async function PromptDetailPage({
  params,
  drawer = false,
}: {
  params: Promise<{ promptId: string }>;
  drawer?: boolean;
}) {
  const { promptId } = await params;
  const [detail, library, targets] = await Promise.all([
    readPromptDetail(promptId),
    readPromptLibrary(),
    readEvalTargets().catch(() => ({ targets: [], canRun: false })),
  ]);
  if (detail.error?.status === 404) notFound();
  if (!detail.data || !library.data)
    return (
      <div role="alert" className="rounded-xl border p-6 text-sm">
        {detail.error?.message ??
          library.error?.message ??
          "Prompt data is unavailable."}
      </div>
    );
  return (
    <PromptDetailView
      initial={detail.data}
      initialLibrary={library.data}
      targets={targets}
      drawer={drawer}
    />
  );
}
