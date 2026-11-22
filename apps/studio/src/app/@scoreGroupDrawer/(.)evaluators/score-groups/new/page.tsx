import { ScoreGroupPage } from "@/features/evaluators/components/score-group-page";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ScoreGroupPage drawer searchParams={searchParams} />;
}
