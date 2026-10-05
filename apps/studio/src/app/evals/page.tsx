import { legacyEvalHref } from "@/features/evals/lib/navigation";
import { scopedRedirect } from "@/lib/scoped-redirect";
export default async function EvalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await scopedRedirect(legacyEvalHref(await searchParams));
}
