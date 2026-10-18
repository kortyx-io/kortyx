import { EvalComparisonCasePage } from "@/features/evals/components/eval-comparison-case-page";
export default function Page(props: {
  params: Promise<{ evalRunId: string; caseId: string }>;
  searchParams: Promise<{ baseline?: string }>;
}) {
  return <EvalComparisonCasePage {...props} />;
}
