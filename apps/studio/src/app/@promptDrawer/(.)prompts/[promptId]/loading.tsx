import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
import { PromptDetailHeader } from "@/features/prompts/components/prompt-detail-header";
export default function Loading() {
  return (
    <DetailDrawerLoading
      header={
        <PromptDetailHeader
          title="Prompt details"
          promptKey="Loading prompt…"
        />
      }
      basePath="/prompts"
      title="Prompt details"
      description="Inspect prompts and versions"
    />
  );
}
