import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/evals/cases"
      title="Case evaluation"
      description="Evaluation results"
    />
  );
}
