import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";
import { extractToc } from "../utils/extract-toc";
import { docsConfig } from "./config";

export type DocFrontmatter = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  sidebarLabel: string;
};

export type DocRecord = {
  version: string;
  slugSegments: string[];
  slug: string;
  relativeFile: string;
  sourceFile: string;
  frontmatter: DocFrontmatter;
  content: string;
};

type DocsSearchSection = {
  id: string;
  text: string;
  content: string;
};

export type DocsSearchEntry = {
  href: string;
  title: string;
  description: string;
  keywords: string[];
  version: string;
  section: string | null;
  content: string;
};

function getDocsSearchSections(content: string): DocsSearchSection[] {
  const headings = extractToc(content);
  if (headings.length === 0) return [];

  const sections: DocsSearchSection[] = [];
  const lines = content.split("\n");
  let headingIndex = 0;
  let inCodeFence = false;
  let current: DocsSearchSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      if (current) current.content += `${line}\n`;
      continue;
    }

    if (!inCodeFence && /^(#{2,3})\s+/.test(trimmed)) {
      if (current)
        sections.push({ ...current, content: current.content.trim() });
      const heading = headings[headingIndex];
      headingIndex += 1;
      current = heading
        ? { id: heading.id, text: heading.text, content: "" }
        : null;
      continue;
    }

    if (current) current.content += `${line}\n`;
  }

  if (current) sections.push({ ...current, content: current.content.trim() });
  return sections;
}

export type SectionMeta = {
  slug: string;
  position: number;
  label: string;
  collapsed: boolean;
};

type VersionDocs = {
  version: string;
  docs: DocRecord[];
  docsBySlug: Map<string, DocRecord>;
  docsByRelativeFile: Map<string, DocRecord>;
  docsByNormalizedRelativeFile: Map<string, DocRecord>;
  sections: SectionMeta[];
};

type DocsStore = {
  versions: string[];
  latestVersion: string;
  byVersion: Map<string, VersionDocs>;
};

type RouteResolutionBase = {
  requestedVersion: string;
  explicitVersion: boolean;
  versionDocs: VersionDocs;
  canonicalPath: string;
  redirectTo: string | null;
};

type DocRouteResolution = RouteResolutionBase & {
  routeKind: "doc";
  doc: DocRecord;
};

type SectionRouteResolution = RouteResolutionBase & {
  routeKind: "section";
  sectionSlug: string;
};

type RouteResolution = DocRouteResolution | SectionRouteResolution;

const OVERVIEW_FILE_NAMES = new Set(["README.md", "00-overview.md"]);

function normalizeRouteSegment(segment: string): string {
  return segment.replace(/^\d+-/, "");
}

function isOverviewMarkdownFile(fileName: string): boolean {
  return OVERVIEW_FILE_NAMES.has(fileName);
}

function toPosixPath(input: string): string {
  return input.split(path.sep).join(path.posix.sep);
}

function normalizeRelativeMdPath(relativePath: string): string {
  const posixPath = toPosixPath(relativePath);
  const parts = posixPath.split(path.posix.sep);

  return parts
    .map((part, index) => {
      const isFile = index === parts.length - 1;
      if (!isFile) return normalizeRouteSegment(part);
      if (!part.endsWith(".md")) return normalizeRouteSegment(part);

      const fileBase = part.slice(0, -3);
      const normalizedBase = normalizeRouteSegment(fileBase);
      return `${normalizedBase}.md`;
    })
    .join(path.posix.sep);
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function parseFrontmatter(
  version: string,
  slugSegments: string[],
  raw: Record<string, unknown>,
): DocFrontmatter {
  const lastSlug = slugSegments.at(-1);
  const fallbackTitle =
    typeof lastSlug === "string" ? titleCaseFromSlug(lastSlug) : "Overview";

  const idValue = raw.id;
  const titleValue = raw.title;
  const descriptionValue = raw.description;
  const sidebarLabelValue = raw.sidebar_label;

  return {
    id:
      typeof idValue === "string" && idValue.length > 0
        ? idValue
        : [version, ...(slugSegments.length > 0 ? slugSegments : ["overview"])]
            .join("-")
            .toLowerCase(),
    title:
      typeof titleValue === "string" && titleValue.length > 0
        ? titleValue
        : fallbackTitle,
    description:
      typeof descriptionValue === "string" && descriptionValue.length > 0
        ? descriptionValue
        : "Kortyx documentation page.",
    keywords: parseKeywords(raw.keywords),
    sidebarLabel:
      typeof sidebarLabelValue === "string" && sidebarLabelValue.length > 0
        ? sidebarLabelValue
        : fallbackTitle,
  };
}

async function walkMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function readSectionMetadata(versionDir: string): Promise<SectionMeta[]> {
  const entries = await readdir(versionDir, { withFileTypes: true });
  const sections: SectionMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rawFolderName = entry.name;
    const slug = normalizeRouteSegment(rawFolderName);
    const metadataPath = path.join(versionDir, rawFolderName, "metadata.json");

    let position = sections.length + 1;
    let label = titleCaseFromSlug(slug);
    let collapsed = false;

    try {
      const rawMetadata = await readFile(metadataPath, "utf8");
      const parsed = JSON.parse(rawMetadata) as Record<string, unknown>;
      if (typeof parsed.position === "number") position = parsed.position;
      if (typeof parsed.label === "string" && parsed.label.length > 0) {
        label = parsed.label;
      }
      if (typeof parsed.collapsed === "boolean") collapsed = parsed.collapsed;
    } catch {
      // metadata.json is optional for routing; default values are fine.
    }

    sections.push({ slug, position, label, collapsed });
  }

  sections.sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label),
  );
  return sections;
}

async function readVersionDocs(version: string): Promise<VersionDocs> {
  const versionDir = path.join(docsConfig.docsRoot, version);
  const markdownFiles = await walkMarkdownFiles(versionDir);

  const docs: DocRecord[] = [];
  const docsBySlug = new Map<string, DocRecord>();
  const docsByRelativeFile = new Map<string, DocRecord>();
  const docsByNormalizedRelativeFile = new Map<string, DocRecord>();

  for (const filePath of markdownFiles) {
    const relativeFromVersion = toPosixPath(
      path.relative(versionDir, filePath),
    );
    const pathParts = relativeFromVersion.split(path.posix.sep);
    const fileName = pathParts[pathParts.length - 1];
    if (!fileName) continue;
    const dirParts = pathParts.slice(0, -1);

    const slugSegments = [
      ...dirParts.map(normalizeRouteSegment),
      ...(isOverviewMarkdownFile(fileName)
        ? []
        : [normalizeRouteSegment(fileName.replace(/\.md$/, ""))]),
    ];
    const slug = slugSegments.join("/");

    if (docsBySlug.has(slug)) {
      throw new Error(
        `Duplicate docs route slug "${slug}" in version "${version}".`,
      );
    }

    const rawFile = await readFile(filePath, "utf8");
    const parsed = matter(rawFile);
    const frontmatter = parseFrontmatter(
      version,
      slugSegments,
      parsed.data as Record<string, unknown>,
    );

    const doc: DocRecord = {
      version,
      slugSegments,
      slug,
      relativeFile: relativeFromVersion,
      sourceFile: filePath,
      frontmatter,
      content: parsed.content,
    };

    docs.push(doc);
    docsBySlug.set(slug, doc);
    docsByRelativeFile.set(relativeFromVersion, doc);
    docsByNormalizedRelativeFile.set(
      normalizeRelativeMdPath(relativeFromVersion),
      doc,
    );
  }

  docs.sort((a, b) => a.relativeFile.localeCompare(b.relativeFile));
  const sections = await readSectionMetadata(versionDir);

  return {
    version,
    docs,
    docsBySlug,
    docsByRelativeFile,
    docsByNormalizedRelativeFile,
    sections,
  };
}

const getDocsStore = cache(async (): Promise<DocsStore> => {
  const byVersion = new Map<string, VersionDocs>();
  for (const version of docsConfig.versions) {
    byVersion.set(version, await readVersionDocs(version));
  }
  return {
    versions: [...docsConfig.versions],
    latestVersion: docsConfig.latestVersion,
    byVersion,
  };
});

function toDocsPath(segments: string[]): string {
  if (segments.length === 0) return "/docs";
  return `/docs/${segments.join("/")}`;
}

function normalizeSlugPath(input: string): string {
  return input.replace(/^\/+|\/+$/g, "");
}

function resolveLegacyDocSlug(version: string, slug: string): string {
  const redirects = docsConfig.legacyRedirects[version];
  if (!redirects) return normalizeSlugPath(slug);

  let current = normalizeSlugPath(slug);
  const seen = new Set<string>();

  while (redirects[current] && !seen.has(current)) {
    seen.add(current);
    current = normalizeSlugPath(redirects[current] ?? "");
  }

  return current;
}

export async function getDocsVersions(): Promise<string[]> {
  const store = await getDocsStore();
  return store.versions;
}

export async function getLatestDocsVersion(): Promise<string> {
  const store = await getDocsStore();
  return store.latestVersion;
}

export async function resolveDocsRoute(
  routeSegments: string[],
): Promise<RouteResolution | null> {
  const store = await getDocsStore();
  const [first, ...rest] = routeSegments;

  const explicitVersion =
    typeof first === "string" && store.versions.includes(first);
  const requestedVersion =
    explicitVersion && typeof first === "string" ? first : store.latestVersion;
  const requestedDocSlug = (explicitVersion ? rest : routeSegments).join("/");
  const docSlug = resolveLegacyDocSlug(requestedVersion, requestedDocSlug);
  const docSlugSegments = docSlug ? docSlug.split("/").filter(Boolean) : [];

  const versionDocs = store.byVersion.get(requestedVersion);
  if (!versionDocs) return null;

  let doc = versionDocs.docsBySlug.get(docSlug);
  if (!doc && docSlugSegments.length === 0) {
    doc = versionDocs.docs[0];
  }
  if (doc) {
    const canonicalSegments =
      requestedVersion === store.latestVersion
        ? doc.slugSegments
        : [requestedVersion, ...doc.slugSegments];
    const canonicalPath = toDocsPath(canonicalSegments);
    const requestedPath = toDocsPath(routeSegments);
    const redirectTo = requestedPath === canonicalPath ? null : canonicalPath;

    return {
      routeKind: "doc",
      requestedVersion,
      explicitVersion,
      versionDocs,
      doc,
      canonicalPath,
      redirectTo,
    };
  }

  if (docSlugSegments.length !== 1) return null;
  const sectionSlug = docSlugSegments[0];
  if (!sectionSlug) return null;

  const sectionDocs = versionDocs.docs
    .filter((entry) => entry.slugSegments[0] === sectionSlug)
    .sort((a, b) => a.relativeFile.localeCompare(b.relativeFile));
  if (sectionDocs.length === 0) return null;

  const canonicalSegments =
    requestedVersion === store.latestVersion
      ? [sectionSlug]
      : [requestedVersion, sectionSlug];
  const canonicalPath = toDocsPath(canonicalSegments);
  const requestedPath = toDocsPath(routeSegments);
  const redirectTo = requestedPath === canonicalPath ? null : canonicalPath;

  return {
    routeKind: "section",
    requestedVersion,
    explicitVersion,
    versionDocs,
    sectionSlug,
    canonicalPath,
    redirectTo,
  };
}

export type SidebarItem = {
  href: string;
  title: string;
  slug: string;
  description: string;
};

export type SidebarSection = {
  slug: string;
  label: string;
  href: string;
  collapsed: boolean;
  items: SidebarItem[];
};

export async function getVersionSidebar(
  version: string,
): Promise<SidebarSection[]> {
  const store = await getDocsStore();
  const versionDocs = store.byVersion.get(version);
  if (!versionDocs) return [];

  const bySection = new Map<string, DocRecord[]>();
  for (const doc of versionDocs.docs) {
    const sectionSlug = doc.slugSegments[0] ?? "__root__";
    const existing = bySection.get(sectionSlug) ?? [];
    existing.push(doc);
    bySection.set(sectionSlug, existing);
  }

  const sectionList: SidebarSection[] = [];
  const rootDocs = (bySection.get("__root__") ?? []).sort((a, b) =>
    a.relativeFile.localeCompare(b.relativeFile),
  );

  if (rootDocs.length > 0) {
    sectionList.push({
      slug: "__root__",
      label: "Overview",
      href: buildDocHref(version, []),
      collapsed: false,
      items: rootDocs.map((doc) => ({
        href: buildDocHref(doc.version, doc.slugSegments),
        title: doc.frontmatter.sidebarLabel,
        slug: doc.slug,
        description: doc.frontmatter.description,
      })),
    });
  }

  for (const sectionMeta of versionDocs.sections) {
    const sectionDocs = (bySection.get(sectionMeta.slug) ?? []).sort((a, b) =>
      a.relativeFile.localeCompare(b.relativeFile),
    );
    if (sectionDocs.length === 0) continue;

    sectionList.push({
      slug: sectionMeta.slug,
      label: sectionMeta.label,
      href: buildDocHref(version, [sectionMeta.slug]),
      collapsed: sectionMeta.collapsed,
      items: sectionDocs.map((doc) => ({
        href: buildDocHref(doc.version, doc.slugSegments),
        title: doc.frontmatter.sidebarLabel,
        slug: doc.slug,
        description: doc.frontmatter.description,
      })),
    });
  }

  return sectionList;
}

export async function getDocByVersionAndSlug(
  version: string,
  slug: string,
): Promise<DocRecord | null> {
  const store = await getDocsStore();
  const versionDocs = store.byVersion.get(version);
  if (!versionDocs) return null;
  return versionDocs.docsBySlug.get(slug) ?? null;
}

export function buildDocHref(version: string, slugSegments: string[]): string {
  if (version === docsConfig.latestVersion) {
    return toDocsPath(slugSegments);
  }
  return toDocsPath([version, ...slugSegments]);
}

export async function getDocsSearchIndex(): Promise<DocsSearchEntry[]> {
  const store = await getDocsStore();
  const entries: DocsSearchEntry[] = [];

  for (const version of store.versions) {
    const versionDocs = store.byVersion.get(version);
    if (!versionDocs) continue;

    for (const doc of versionDocs.docs) {
      const href = buildDocHref(doc.version, doc.slugSegments);
      const sectionSlug = doc.slugSegments[0] ?? null;
      const section =
        versionDocs.sections.find((item) => item.slug === sectionSlug)?.label ??
        null;

      entries.push({
        href,
        title: doc.frontmatter.title,
        description: doc.frontmatter.description,
        keywords: doc.frontmatter.keywords,
        version: doc.version,
        section,
        content: doc.content,
      });

      for (const searchSection of getDocsSearchSections(doc.content)) {
        entries.push({
          href: `${href}#${searchSection.id}`,
          title: searchSection.text,
          description: doc.frontmatter.title,
          keywords: doc.frontmatter.keywords,
          version: doc.version,
          section: doc.frontmatter.title,
          content: searchSection.content,
        });
      }
    }
  }

  return entries;
}

export async function generateDocsStaticParams(): Promise<
  Array<{ slug: string[] }>
> {
  const store = await getDocsStore();
  const unique = new Map<string, string[]>();

  for (const version of store.versions) {
    const versionDocs = store.byVersion.get(version);
    if (!versionDocs) continue;

    for (const doc of versionDocs.docs) {
      const canonicalSegments =
        version === store.latestVersion
          ? doc.slugSegments
          : [version, ...doc.slugSegments];
      unique.set(canonicalSegments.join("/"), canonicalSegments);

      // Keep explicit-latest URLs valid so they can redirect to canonical /docs/*.
      if (version === store.latestVersion) {
        const explicitLatestSegments = [version, ...doc.slugSegments];
        unique.set(explicitLatestSegments.join("/"), explicitLatestSegments);
      }
    }

    const rootSegments = version === store.latestVersion ? [] : [version];
    unique.set(rootSegments.join("/"), rootSegments);

    if (version === store.latestVersion) {
      unique.set(version, [version]);
    }

    const sectionSlugs = new Set(
      versionDocs.docs
        .map((doc) => doc.slugSegments[0])
        .filter((segment): segment is string => Boolean(segment)),
    );

    for (const sectionSlug of sectionSlugs) {
      const canonicalSectionSegments =
        version === store.latestVersion
          ? [sectionSlug]
          : [version, sectionSlug];
      unique.set(canonicalSectionSegments.join("/"), canonicalSectionSegments);

      if (version === store.latestVersion) {
        const explicitLatestSectionSegments = [version, sectionSlug];
        unique.set(
          explicitLatestSectionSegments.join("/"),
          explicitLatestSectionSegments,
        );
      }
    }

    const legacyRedirects = docsConfig.legacyRedirects[version] ?? {};
    for (const fromSlug of Object.keys(legacyRedirects)) {
      const normalizedFrom = normalizeSlugPath(fromSlug);
      if (!normalizedFrom) continue;

      const fromSegments = normalizedFrom.split("/").filter(Boolean);
      const canonicalLegacySegments =
        version === store.latestVersion
          ? fromSegments
          : [version, ...fromSegments];
      unique.set(canonicalLegacySegments.join("/"), canonicalLegacySegments);

      if (version === store.latestVersion) {
        const explicitLatestLegacySegments = [version, ...fromSegments];
        unique.set(
          explicitLatestLegacySegments.join("/"),
          explicitLatestLegacySegments,
        );
      }
    }
  }

  return [...unique.values()].map((slug) => ({ slug }));
}

export function rewriteMarkdownHref(args: {
  href: string;
  version: string;
  currentRelativeFile: string;
  versionDocs: VersionDocs;
}): string {
  const { href, version, currentRelativeFile, versionDocs } = args;
  if (!href) return href;
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("#")
  ) {
    return href;
  }

  const [targetPath, hash] = href.split("#", 2);
  if (!targetPath || !targetPath.endsWith(".md")) return href;

  const currentDir = path.posix.dirname(currentRelativeFile);
  const normalizedTarget = path.posix.normalize(
    path.posix.join(currentDir, targetPath),
  );
  const targetDoc =
    versionDocs.docsByRelativeFile.get(normalizedTarget) ??
    versionDocs.docsByNormalizedRelativeFile.get(
      normalizeRelativeMdPath(normalizedTarget),
    );
  if (!targetDoc) return href;

  const targetHref = buildDocHref(version, targetDoc.slugSegments);
  return hash ? `${targetHref}#${hash}` : targetHref;
}
