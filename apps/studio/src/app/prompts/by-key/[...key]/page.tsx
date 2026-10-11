import { notFound } from "next/navigation";
import { readPromptDetail } from "@/features/prompts/api/server";
import { scopedRedirect } from "@/lib/scoped-redirect";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ key: string[] }>;
  searchParams: Promise<{ v?: string; project?: string; environment?: string }>;
}) {
  const { key } = await params,
    query = await searchParams;
  const result = await readPromptDetail(key.join("/"), true);
  if (result.error?.status === 404) notFound();
  if (!result.data)
    return (
      <p role="alert" className="p-6 text-sm">
        {result.error?.message ?? "Prompt unavailable."}
      </p>
    );
  const suffix = new URLSearchParams();
  if (query.v && /^\d+$/.test(query.v)) suffix.set("v", query.v);
  if (query.project) suffix.set("project", query.project);
  if (query.environment) suffix.set("environment", query.environment);
  await scopedRedirect(
    `/prompts/${result.data.asset.id}${suffix.size ? `?${suffix}` : ""}`,
  );
}
