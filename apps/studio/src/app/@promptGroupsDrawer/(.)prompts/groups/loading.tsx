import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/prompts"
      title="Test groups"
      description="Inspect prompts and versions"
    />
  );
}
