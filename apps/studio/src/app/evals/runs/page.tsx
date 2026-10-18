import { EvalsListPage } from "@/features/evals/components/evals-list-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <EvalsListPage view="runs" query={await searchParams} />;
}
