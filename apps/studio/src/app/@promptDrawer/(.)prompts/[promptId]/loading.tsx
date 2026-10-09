import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/prompts"
      title="Prompt details"
      description="Inspect prompts and versions"
    />
  );
}
