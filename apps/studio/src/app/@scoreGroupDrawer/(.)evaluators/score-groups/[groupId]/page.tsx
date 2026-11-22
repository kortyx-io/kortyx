import { ScoreGroupPage } from "@/features/evaluators/components/score-group-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ScoreGroupPage
      id={(await params).groupId}
      drawer
      searchParams={searchParams}
    />
  );
}
