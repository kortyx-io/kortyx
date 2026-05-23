import type { MetadataRoute } from "next";
import { generateDocsStaticParams, resolveDocsRoute } from "@/lib/docs";
import { getDocLastUpdatedMeta } from "@/lib/docs/last-updated";
import { siteConfig } from "@/lib/site";

type SitemapEntry = MetadataRoute.Sitemap[number];

const origin = siteConfig.url.replace(/\/$/, "");

function toAbsoluteUrl(pathname: string): string {
  return new URL(pathname, origin).toString();
}

function toValidDate(value: string | null): Date | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getLatestDate(dates: Array<Date | undefined>): Date | undefined {
  return dates.reduce<Date | undefined>((latest, date) => {
    if (!date) return latest;
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, undefined);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = new Map<string, SitemapEntry>();

  entries.set("/", {
    url: toAbsoluteUrl("/"),
    changeFrequency: "weekly",
    priority: 1,
  });

  const docsParams = await generateDocsStaticParams();

  await Promise.all(
    docsParams.map(async ({ slug }) => {
      const resolved = await resolveDocsRoute(slug);
      if (
        !resolved ||
        resolved.redirectTo ||
        entries.has(resolved.canonicalPath)
      ) {
        return;
      }

      const lastModified =
        resolved.routeKind === "doc"
          ? toValidDate(
              (
                await getDocLastUpdatedMeta(
                  `${resolved.doc.version}/${resolved.doc.relativeFile}`,
                )
              ).updatedAt,
            )
          : getLatestDate(
              await Promise.all(
                resolved.versionDocs.docs
                  .filter((doc) => doc.slugSegments[0] === resolved.sectionSlug)
                  .map(async (doc) =>
                    toValidDate(
                      (
                        await getDocLastUpdatedMeta(
                          `${doc.version}/${doc.relativeFile}`,
                        )
                      ).updatedAt,
                    ),
                  ),
              ),
            );

      entries.set(resolved.canonicalPath, {
        url: toAbsoluteUrl(resolved.canonicalPath),
        lastModified,
        changeFrequency: "weekly",
        priority: resolved.routeKind === "doc" ? 0.8 : 0.7,
      });
    }),
  );

  return [...entries.values()].sort((a, b) => a.url.localeCompare(b.url));
}
