import { ExperimentsPage } from "@/features/evals/components/evals-list-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ExperimentsPage query={await searchParams} />;
}
