import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import inventory from "../../../test/fixtures/studio-documentation-migration.json";
import { extractToc } from "../utils/extract-toc";
import { docsConfig, getLatestDocsVersionDisplay } from "./config";
import {
  getDocsSearchIndex,
  getVersionSidebar,
  resolveDocsRoute,
  rewriteMarkdownHref,
} from "./index";
import { docsAnchorMoves } from "./migrations";

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

async function assertLink(href: string) {
  const url = new URL(href, "https://kortyx.io");
  let route = await resolveDocsRoute(url.pathname.slice(6).split("/"));
  expect(route, href).not.toBeNull();
  if (url.hash && route?.routeKind === "doc") {
    const moved = docsAnchorMoves[route.canonicalPath]?.[url.hash.slice(1)];
    if (moved) {
      const destination = new URL(moved, url.origin);
      route = await resolveDocsRoute(destination.pathname.slice(6).split("/"));
      url.hash = destination.hash;
    }
    if (route?.routeKind !== "doc") throw Error(href);
    expect(
      extractToc(route.doc.content).map((h) => h.id),
      href,
    ).toContain(decodeURIComponent(url.hash.slice(1)));
  }
}

it("preserves every former Studio page and its indexed heading bookmarks", async () => {
  for (const page of inventory) {
    for (const source of [
      page.source,
      page.source.replace("/studio/", "/studio/v0/"),
      page.source.replace("/studio/", "/v0/studio/"),
    ]) {
      expect(
        await resolveDocsRoute(source.slice(6).split("/")),
        source,
      ).toMatchObject({ canonicalPath: page.destination });
    }
    for (const anchor of page.anchors)
      await assertLink(`${page.source}#${anchor}`);
  }
});

it("resolves authored links and their actual headings across every area", async () => {
  const pages = (await getDocsSearchIndex()).filter(
    (entry) => !entry.href.includes("#"),
  );
  let checked = 0;
  for (const page of pages) {
    const route = await resolveDocsRoute(page.href.slice(6).split("/"));
    if (route?.routeKind !== "doc") throw Error(page.href);
    for (const match of route.doc.content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const raw = match[1] ?? "";
      if (
        !raw.startsWith("/docs/") &&
        !raw.startsWith("#") &&
        !/^(?!https?:).*\.md(?:#|$)/.test(raw)
      )
        continue;
      const href = raw.startsWith("#")
        ? page.href + raw
        : rewriteMarkdownHref({
            href: raw,
            version: route.requestedVersion,
            currentRelativeFile: route.doc.relativeFile,
            versionDocs: route.versionDocs,
          });
      expect(href, `${page.href}: ${raw}`).toMatch(/^\/docs\//);
      await assertLink(href);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(300);
});

it("gives each authored page unique SEO metadata and exposes it through navigation", async () => {
  const ids = new Set<string>();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const area of docsConfig.products) {
    const sidebar = await getVersionSidebar(area.id, area.latestVersion);
    for (const item of sidebar.flatMap((s) => s.items)) {
      const route = await resolveDocsRoute(item.href.slice(6).split("/"));
      if (route?.routeKind !== "doc") throw Error(item.href);
      const front = route.doc.frontmatter;
      expect(ids.has(front.id), item.href).toBe(false);
      ids.add(front.id);
      expect(titles.has(`${area.id}:${front.title}`), item.href).toBe(false);
      titles.add(`${area.id}:${front.title}`);
      expect(descriptions.has(front.description), item.href).toBe(false);
      descriptions.add(front.description);
      expect(front.description.length, item.href).toBeGreaterThanOrEqual(100);
      expect(front.description.length, item.href).toBeLessThanOrEqual(160);
      expect(
        route.doc.content.replace(/^```[\s\S]*?^```/gm, "").match(/^# /gm),
        item.href,
      ).toHaveLength(1);
    }
  }
});

it("labels Cloud as the current service instead of borrowing a package release", async () => {
  expect(await getLatestDocsVersionDisplay("cloud")).toEqual({
    label: "Current service",
    subtitle: "Kortyx Cloud",
  });
});

it("pairs runnable TypeScript examples with JavaScript throughout the reorganized areas", async () => {
  const pages = (await getDocsSearchIndex()).filter(
    (e) => !e.href.includes("#") && e.product !== "sdk",
  );
  let paired = 0;
  for (const page of pages) {
    const route = await resolveDocsRoute(page.href.slice(6).split("/"));
    if (route?.routeKind !== "doc") throw Error(page.href);
    const source = await readFile(path.resolve(route.doc.sourceFile), "utf8");
    const blocks = [...source.matchAll(/^```(\w+)[^\n]*\n[\s\S]*?^```/gm)];
    for (const [i, block] of blocks.entries())
      if (["ts", "typescript"].includes(block[1] ?? "")) {
        expect(blocks[i + 1]?.[1], page.href).toBe("js");
        paired++;
      }
  }
  expect(paired).toBeGreaterThan(10);
});
