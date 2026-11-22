import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/evaluators/score-groups"
      title="Score group"
      description="Versioned judge output fields"
    />
  );
}
