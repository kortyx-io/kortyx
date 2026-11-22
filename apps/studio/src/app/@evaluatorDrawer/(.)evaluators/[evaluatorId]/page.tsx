import { EvaluatorEditorPage } from "@/features/evaluators/components/evaluator-editor-page";

export default async function Page({
  params,
}: {
  params: Promise<{ evaluatorId: string }>;
}) {
  return <EvaluatorEditorPage id={(await params).evaluatorId} drawer />;
}
