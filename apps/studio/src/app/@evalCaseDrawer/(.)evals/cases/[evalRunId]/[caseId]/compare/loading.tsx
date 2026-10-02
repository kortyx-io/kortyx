import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/evals/cases"
      title="Conversation comparison"
      description="Saved run comparison"
    />
  );
}
