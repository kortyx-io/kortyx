import { notFound } from "next/navigation";
import { legacyEvalDetailHref } from "@/features/evals/lib/navigation";
import { scopedRedirect } from "@/lib/scoped-redirect";
import { studioRouteId } from "@/lib/studio-routes";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const href = legacyEvalDetailHref(path.map(studioRouteId), query);
  if (!href) notFound();
  await scopedRedirect(href);
}
