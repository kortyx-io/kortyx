import { notFound } from "next/navigation";
import { readEvalTargets } from "@/features/evals/api/server";
import { readPromptLibrary } from "../api/server";
import { PromptGroupsView } from "./prompt-groups";
export async function PromptGroupsPage({
  groupId,
  drawer = false,
}: {
  groupId?: string;
  drawer?: boolean;
}) {
  const [library, targets] = await Promise.all([
    readPromptLibrary(),
    readEvalTargets().catch(() => ({ targets: [], canRun: false })),
  ]);
  if (!library.data)
    return (
      <p role="alert" className="p-6 text-sm">
        {library.error?.message ?? "Groups unavailable."}
      </p>
    );
  if (groupId && !library.data.groups.some((group) => group.id === groupId))
    notFound();
  return (
    <PromptGroupsView
      initial={library.data}
      targets={targets}
      drawer={drawer}
      {...(groupId ? { groupId } : {})}
    />
  );
}
