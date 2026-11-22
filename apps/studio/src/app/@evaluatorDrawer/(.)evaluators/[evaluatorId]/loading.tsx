import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
import { EvaluatorDetailHeader } from "@/features/evaluators/components/evaluator-detail-header";

export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/evaluators"
      title="Judge details"
      description="Versioned judge instructions"
      header={<EvaluatorDetailHeader title="Judge details" status="Loading…" />}
    />
  );
}
