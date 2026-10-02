import { redirect } from "next/navigation";
import { legacyEvalHref } from "@/features/evals/lib/navigation";
export default async function EvalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyEvalHref(await searchParams));
}
