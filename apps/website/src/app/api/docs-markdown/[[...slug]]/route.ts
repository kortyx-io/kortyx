import { resolveDocsRoute, rewriteMarkdownHref } from "@/lib/docs";

type DocsMarkdownRouteParams = {
  slug?: string[];
};

function permanentRedirect(location: string): Response {
  return new Response(null, {
    status: 308,
    headers: {
      Location: location,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<DocsMarkdownRouteParams> },
) {
  const routeParams = await params;
  const slug = routeParams.slug ?? [];
  const resolved = await resolveDocsRoute(slug);

  if (!resolved || resolved.routeKind !== "doc") {
    if (resolved?.routeKind === "section") {
      return permanentRedirect(resolved.canonicalPath);
    }

    return new Response("Not Found", { status: 404 });
  }

  if (resolved.redirectTo) {
    return permanentRedirect(`${resolved.canonicalPath}.md`);
  }

  let inCodeFence = false;
  const markdown = resolved.doc.content
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inCodeFence = !inCodeFence;
      if (inCodeFence) return line;
      return line.replace(
        /(\]\()([^\s)]+)(\))/g,
        (_match, start: string, href: string, end: string) =>
          `${start}${rewriteMarkdownHref({ href, version: resolved.requestedVersion, currentRelativeFile: resolved.doc.relativeFile, versionDocs: resolved.versionDocs })}${end}`,
      );
    })
    .join("\n");

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
