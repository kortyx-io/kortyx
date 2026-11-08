import { EvalJudgeInstructionsPage } from "@/features/evals/components/eval-judge-instructions-page";
export default function Page(props: {
  params: Promise<{ source: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <EvalJudgeInstructionsPage {...props} />;
}
