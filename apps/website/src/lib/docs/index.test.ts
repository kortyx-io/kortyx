import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { docsConfig, getDocsProduct } from "./config";
import {
  buildDocHref,
  generateDocsStaticParams,
  getDocsSearchIndex,
  getVersionSidebar,
  resolveDocsRoute,
  rewriteMarkdownHref,
} from "./index";

const originalRoot = docsConfig.docsRoot;
let fixtureRoot: string;

// React normally caches this store per server render. Give each test its own
// request cache so the exhaustive route audit does not reread all files per link.
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

beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), "kortyx-docs-"));
  await cp(path.resolve(import.meta.dirname, "../../docs"), fixtureRoot, {
    recursive: true,
  });
  docsConfig.docsRoot = fixtureRoot;
});

afterAll(async () => {
  docsConfig.docsRoot = originalRoot;
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("product documentation routes", () => {
  it.each([
    ["sdk/migration", "/docs/sdk/migration", null],
    ["migration", "/docs/sdk/migration", "/docs/sdk/migration"],
    ["v0/migration", "/docs/sdk/migration", "/docs/sdk/migration"],
    ["sdk/v0/migration", "/docs/sdk/migration", "/docs/sdk/migration"],
    ["sdk", "/docs/sdk/start-here", "/docs/sdk/start-here"],
    ["studio", "/docs/studio/overview", "/docs/studio/overview"],
    [
      "studio/run-locally",
      "/docs/self-hosting/run-locally",
      "/docs/self-hosting/run-locally",
    ],
    [
      "v0/studio/run-locally",
      "/docs/self-hosting/run-locally",
      "/docs/self-hosting/run-locally",
    ],
    [
      "studio/v0/run-locally",
      "/docs/self-hosting/run-locally",
      "/docs/self-hosting/run-locally",
    ],
    [
      "runtime/hooks",
      "/docs/sdk/core-concepts/hooks",
      "/docs/sdk/core-concepts/hooks",
    ],
    ["sdk/getting-started", "/docs/sdk/getting-started", null],
    ["studio/deployment", "/docs/self-hosting", "/docs/self-hosting"],
    ["03-guides/11-sse", "/docs/sdk/guides/sse", "/docs/sdk/guides/sse"],
    [
      "sdk/v0/02-core-concepts/03-nodes.md",
      "/docs/sdk/core-concepts/nodes",
      "/docs/sdk/core-concepts/nodes",
    ],
    [
      "studio/06-deploy-server",
      "/docs/self-hosting/deploy-server",
      "/docs/self-hosting/deploy-server",
    ],
    ["00-start-here/README.md", "/docs/sdk/start-here", "/docs/sdk/start-here"],
    [
      "sdk/getting-started/models",
      "/docs/sdk/kortyx-providers/choose-a-provider",
      "/docs/sdk/kortyx-providers/choose-a-provider",
    ],
  ])("resolves %s", async (slug, canonicalPath, redirectTo) => {
    expect(await resolveDocsRoute(slug.split("/"))).toMatchObject({
      canonicalPath,
      redirectTo,
    });
  });

  it("leaves the landing route to its page and rejects missing products, versions, and pages", async () => {
    for (const slug of [
      "",
      "unknown-area",
      "sdk/v99/migration",
      "studio/missing",
      "cloud/v99/account",
    ]) {
      expect(await resolveDocsRoute(slug ? slug.split("/") : [])).toBeNull();
    }
  });

  it("generates every canonical route and legacy redirect for the static build", async () => {
    const params = await generateDocsStaticParams();
    expect(params).toContainEqual({ slug: [] });
    for (const { slug } of params) {
      if (slug.length)
        expect(await resolveDocsRoute(slug), slug.join("/")).not.toBeNull();
    }
  });

  it("keeps area navigation separate and orders Studio around reader tasks", async () => {
    for (const area of docsConfig.products) {
      const sidebar = await getVersionSidebar(area.id, area.latestVersion);
      expect(sidebar.length).toBeGreaterThan(0);
      expect(
        sidebar
          .flatMap((section) => section.items)
          .every(
            (item) =>
              item.href === `/docs/${area.id}` ||
              item.href.startsWith(`/docs/${area.id}/`),
          ),
      ).toBe(true);
    }
    const studio = await getVersionSidebar("studio", "v0");
    expect(studio.map((section) => section.label)).toEqual([
      "Get started",
      "Inspect and debug",
      "Understand performance",
      "Manage prompts",
      "Evaluate changes",
      "Reference and troubleshooting",
    ]);
    expect(studio[0]?.items.map((item) => item.slug)).toEqual([
      "overview",
      "sample-project",
      "connect-project",
      "first-run",
      "concepts",
    ]);
    expect(
      studio
        .flatMap((section) => section.items)
        .some((item) => /cloud-|run-locally|cli-commands/.test(item.slug)),
    ).toBe(false);
  });

  it("resolves all authored Markdown links after moving the content, including cross-product links", async () => {
    const pages = (await getDocsSearchIndex()).filter(
      (entry) => !entry.href.includes("#"),
    );
    let checked = 0;
    for (const page of pages) {
      const route = await resolveDocsRoute(
        page.href.slice("/docs/".length).split("/"),
      );
      if (route?.routeKind !== "doc") throw new Error(page.href);
      for (const match of route.doc.content.matchAll(
        /\]\(([^\s)]+\.md(?:#[^\s)]*)?)\)/g,
      )) {
        const href = rewriteMarkdownHref({
          href: match[1] ?? "",
          version: route.requestedVersion,
          currentRelativeFile: route.doc.relativeFile,
          versionDocs: route.versionDocs,
        });
        expect(href, `${page.href}: ${match[1]}`).toMatch(/^\/docs\//);
        expect(
          await resolveDocsRoute(
            href.split("#")[0]?.slice("/docs/".length).split("/") ?? [],
          ),
        ).not.toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("keeps documentation search descriptions useful without clipping", async () => {
    const pages = (await getDocsSearchIndex()).filter(
      (entry) => !entry.href.includes("#"),
    );
    for (const page of pages) {
      expect(page.description.length, page.href).toBeGreaterThanOrEqual(100);
      expect(page.description.length, page.href).toBeLessThanOrEqual(160);
    }
  });

  it("archives a previous SDK major independently and accepts another product", async () => {
    const sdk = getDocsProduct("sdk");
    if (!sdk) throw new Error("Missing SDK");
    await mkdir(path.join(fixtureRoot, "sdk/v1/00-start-here"), {
      recursive: true,
    });
    await writeFile(
      path.join(fixtureRoot, "sdk/v1/00-start-here/README.md"),
      "# SDK v1\n",
    );
    await mkdir(path.join(fixtureRoot, "ui/v1"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "ui/v1/00-overview.md"), "# UI\n");
    sdk.versions = ["v1", "v0"];
    sdk.latestVersion = "v1";
    docsConfig.products.push({
      id: "ui",
      label: "Kortyx UI",
      description: "UI library",
      icon: "sdk",
      versions: ["v1"],
      latestVersion: "v1",
      overview: "",
      legacyRedirects: {},
    });
    try {
      expect(await resolveDocsRoute(["sdk", "start-here"])).toMatchObject({
        requestedVersion: "v1",
        canonicalPath: "/docs/sdk/start-here",
      });
      expect(await resolveDocsRoute(["sdk", "v0", "migration"])).toMatchObject({
        requestedVersion: "v0",
        canonicalPath: "/docs/sdk/v0/migration",
        redirectTo: null,
      });
      expect(await resolveDocsRoute(["v0", "migration"])).toMatchObject({
        redirectTo: "/docs/sdk/v0/migration",
      });
      expect(
        await resolveDocsRoute([
          "sdk",
          "v0",
          "02-core-concepts",
          "03-nodes.md",
        ]),
      ).toMatchObject({
        requestedVersion: "v0",
        canonicalPath: "/docs/sdk/v0/core-concepts/nodes",
      });
      expect(await resolveDocsRoute(["studio", "run-locally"])).toMatchObject({
        requestedVersion: "v0",
        canonicalPath: "/docs/self-hosting/run-locally",
      });
      expect(await resolveDocsRoute(["ui"])).toMatchObject({
        canonicalPath: "/docs/ui",
        redirectTo: null,
      });
      expect(buildDocHref("sdk", "v1", ["start-here"])).toBe(
        "/docs/sdk/start-here",
      );
      expect(buildDocHref("sdk", "v0", ["migration"])).toBe(
        "/docs/sdk/v0/migration",
      );
      expect(await generateDocsStaticParams()).toContainEqual({
        slug: ["sdk", "v0", "migration"],
      });
      const entries = await getDocsSearchIndex();
      expect(
        entries.find((entry) => entry.href === "/docs/sdk/v0/migration")
          ?.isLatest,
      ).toBe(false);
      expect(
        entries.find((entry) => entry.href === "/docs/self-hosting/run-locally")
          ?.isLatest,
      ).toBe(true);
    } finally {
      sdk.versions = ["v0"];
      sdk.latestVersion = "v0";
      docsConfig.products.pop();
    }
  });
});
