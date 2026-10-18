import { readFile } from "node:fs/promises";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { beforeEach, expect, it, vi } from "vitest";
import { studioHelp } from "../../../../studio/src/lib/studio-help";
import { resolveDocsRoute } from "./index";
import { docsAnchorMoves } from "./migrations";

// Match React's request cache so the link audit shares one docs read per test.
const requestCache = vi.hoisted(() => new Map<() => unknown, unknown>());
vi.mock("react", () => ({
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      if (args.length) return fn(...args);
      if (!requestCache.has(fn)) requestCache.set(fn, fn());
      return requestCache.get(fn);
    },
}));
beforeEach(() => requestCache.clear());

// Exercise the real docs router and heading slugs, rather than copying its URL list.
it.each(
  Object.entries(studioHelp),
)("Studio help %s resolves to an authored page and anchor", async (_topic, help) => {
  const url = new URL(help.documentationUrl);
  expect(url.origin).toBe("https://kortyx.io");
  let route = await resolveDocsRoute(
    url.pathname.slice("/docs/".length).split("/"),
  );
  expect(route?.routeKind).toBe("doc");
  if (route?.routeKind !== "doc") throw new Error(help.documentationUrl);
  const movedHeading =
    docsAnchorMoves[route.canonicalPath]?.[url.hash.slice(1)];
  if (movedHeading) {
    const moved = new URL(movedHeading, url.origin);
    route = await resolveDocsRoute(moved.pathname.slice(6).split("/"));
    url.hash = moved.hash;
    if (route?.routeKind !== "doc") throw new Error(movedHeading);
  }
  if (url.hash) {
    const slugger = new GithubSlugger();
    const anchors = [...route.doc.content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
      (match) => slugger.slug(match[1] ?? ""),
    );
    expect(anchors, help.documentationUrl).toContain(url.hash.slice(1));
  }
});

it("new Studio guides resolve their relative Markdown links and heading fragments", async () => {
  const { rewriteMarkdownHref } = await import("./index");
  const seen = new Set<string>();
  for (const help of Object.values(studioHelp)) {
    const url = new URL(help.documentationUrl);
    if (seen.has(url.pathname)) continue;
    seen.add(url.pathname);
    const route = await resolveDocsRoute(url.pathname.slice(6).split("/"));
    if (route?.routeKind !== "doc") throw new Error(help.documentationUrl);
    for (const match of route.doc.content.matchAll(
      /\]\(([^\s)]+\.md(?:#[^\s)]*)?)\)/g,
    )) {
      const href = rewriteMarkdownHref({
        href: match[1] ?? "",
        version: route.requestedVersion,
        currentRelativeFile: route.doc.relativeFile,
        versionDocs: route.versionDocs,
      });
      const [pathname, hash] = href.split("#");
      const target = await resolveDocsRoute(
        (pathname ?? "").slice(6).split("/"),
      );
      expect(target, href).not.toBeNull();
      if (hash && target?.routeKind === "doc") {
        const slugger = new GithubSlugger();
        const anchors = [
          ...target.doc.content.matchAll(/^#{1,6}\s+(.+)$/gm),
        ].map((heading) => slugger.slug(heading[1] ?? ""));
        expect(anchors, `${route.doc.slug}: ${href}`).toContain(hash);
      }
    }
  }
});

it("new Cloud guidance teaches customer workflows without private implementation configuration", async () => {
  const directory = path.resolve(import.meta.dirname, "../../docs/cloud/v0");
  for (const file of [
    "README.md",
    "get-started.md",
    "workspaces.md",
    "api-keys.md",
    "account.md",
    "sign-in.md",
    "evaluations.md",
    "recovery.md",
    "troubleshooting.md",
  ]) {
    const content = await readFile(path.join(directory, file), "utf8");
    expect(content).not.toMatch(
      /KORTYX_CLOUD_(?:BFF|OIDC|GRANT)|ee-apps\/|ee-packages\//,
    );
  }
});
