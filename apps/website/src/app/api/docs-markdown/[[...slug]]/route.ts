import { resolveDocsRoute } from "@/lib/docs";

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

  return new Response(resolved.doc.content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
