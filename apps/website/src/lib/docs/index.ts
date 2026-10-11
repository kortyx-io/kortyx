import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { extractToc } from "../utils/extract-toc";
import { type DocsProduct, docsConfig, getDocsProduct } from "./config";
import { parseMarkdownFrontmatter } from "./frontmatter";

export type DocFrontmatter = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  sidebarLabel: string;
};

export type DocRecord = {
  product: string;
  sectionSlug: string;
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
  product: string;
  productLabel: string;
  isLatest: boolean;
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
  product: DocsProduct;
  root: string;
  linkedDocsBySourceFile: Map<string, DocRecord>;
  version: string;
  docs: DocRecord[];
  docsBySlug: Map<string, DocRecord>;
  docsByRelativeFile: Map<string, DocRecord>;
  docsByNormalizedRelativeFile: Map<string, DocRecord>;
  sections: SectionMeta[];
};

type DocsStore = {
  byProduct: Map<string, Map<string, VersionDocs>>;
};

type RouteResolutionBase = {
  product: DocsProduct;
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

  // Flat document URLs may still be organized into several sidebar sections.
  try {
    const metadata = JSON.parse(
      await readFile(path.join(versionDir, "metadata.json"), "utf8"),
    ) as {
      sections?: Array<{
        slug: string;
        label: string;
        position: number;
        collapsed?: boolean;
      }>;
    };
    for (const section of metadata.sections ?? []) {
      sections.push({ ...section, collapsed: section.collapsed ?? false });
    }
  } catch {
    // Version-level navigation metadata is optional.
  }

  sections.sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label),
  );
  return sections;
}

async function readVersionDocs(
  product: DocsProduct,
  version: string,
): Promise<VersionDocs> {
  const versionDir = path.join(docsConfig.docsRoot, product.id, version);
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
    const parsed = parseMarkdownFrontmatter(rawFile);
    const frontmatter = parseFrontmatter(
      version,
      slugSegments,
      parsed.data as Record<string, unknown>,
    );

    const doc: DocRecord = {
      product: product.id,
      sectionSlug:
        typeof parsed.data.section === "string"
          ? parsed.data.section
          : (slugSegments[0] ?? "__root__"),
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
    product,
    root: versionDir,
    linkedDocsBySourceFile: new Map(),
    version,
    docs,
    docsBySlug,
    docsByRelativeFile,
    docsByNormalizedRelativeFile,
    sections,
  };
}

const getDocsStore = cache(async (): Promise<DocsStore> => {
  const byProduct = new Map<string, Map<string, VersionDocs>>();
  const linkedDocsBySourceFile = new Map<string, DocRecord>();
  for (const product of docsConfig.products) {
    const versions = new Map<string, VersionDocs>();
    for (const version of product.versions) {
      const versionDocs = await readVersionDocs(product, version);
      versionDocs.linkedDocsBySourceFile = linkedDocsBySourceFile;
      versions.set(version, versionDocs);
      for (const doc of versionDocs.docs)
        linkedDocsBySourceFile.set(doc.sourceFile, doc);
    }
    byProduct.set(product.id, versions);
  }
  return { byProduct };
});

function toDocsPath(segments: string[]): string {
  return segments.length === 0 ? "/docs" : `/docs/${segments.join("/")}`;
}

function normalizeSlugPath(input: string): string {
  return input.replace(/^\/+|\/+$/g, "");
}

function resolveLegacyDocSlug(
  product: DocsProduct,
  version: string,
  slug: string,
): string {
  const redirects = product.legacyRedirects[version] ?? {};
  let current = normalizeSlugPath(slug);
  const seen = new Set<string>();
  while (redirects[current] && !seen.has(current)) {
    seen.add(current);
    current = normalizeSlugPath(redirects[current] ?? "");
  }
  return current;
}

export async function resolveDocsRoute(
  routeSegments: string[],
): Promise<RouteResolution | null> {
  if (routeSegments.length === 0) return null;
  const store = await getDocsStore();
  let [first, ...segments] = routeSegments;
  let product = getDocsProduct(first ?? "");
  let explicitVersion = false;
  let requestedVersion: string;

  if (product) {
    explicitVersion = product.versions.includes(segments[0] ?? "");
    requestedVersion = explicitVersion
      ? (segments.shift() as string)
      : product.latestVersion;
  } else {
    // Preserve the original /docs/* and /docs/vN/* links.
    product = getDocsProduct("sdk");
    if (!product) return null;
    explicitVersion = product.versions.includes(first ?? "");
    requestedVersion = explicitVersion
      ? (first as string)
      : product.latestVersion;
    if (!explicitVersion) segments = routeSegments;
    if (segments[0] === "studio") {
      product = getDocsProduct("studio");
      if (!product) return null;
      segments = segments.slice(1);
      if (!explicitVersion) requestedVersion = product.latestVersion;
    }
  }

  const versionDocs = store.byProduct.get(product.id)?.get(requestedVersion);
  if (!versionDocs) return null;
  const requestedSlug = segments.join("/");
  const docSlug = resolveLegacyDocSlug(
    product,
    requestedVersion,
    requestedSlug || product.overview,
  );
  const doc = versionDocs.docsBySlug.get(docSlug);
  const section = versionDocs.sections.find((entry) => entry.slug === docSlug);
  if (
    !doc &&
    (!section ||
      !versionDocs.docs.some((entry) => entry.sectionSlug === section.slug))
  )
    return null;

  const canonicalPath = buildDocHref(
    product.id,
    requestedVersion,
    doc ? doc.slugSegments : [docSlug],
  );
  const base = {
    product,
    requestedVersion,
    explicitVersion,
    versionDocs,
    canonicalPath,
    redirectTo:
      toDocsPath(routeSegments) === canonicalPath ? null : canonicalPath,
  };
  return doc
    ? { ...base, routeKind: "doc", doc }
    : { ...base, routeKind: "section", sectionSlug: docSlug };
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
  product: string,
  version: string,
): Promise<SidebarSection[]> {
  const versionDocs = (await getDocsStore()).byProduct
    .get(product)
    ?.get(version);
  if (!versionDocs) return [];
  const sections = [...versionDocs.sections];
  if (versionDocs.docs.some((doc) => doc.sectionSlug === "__root__")) {
    sections.unshift({
      slug: "__root__",
      label: "Overview",
      position: 0,
      collapsed: false,
    });
  }
  return sections.flatMap((section) => {
    const docs = versionDocs.docs.filter(
      (doc) => doc.sectionSlug === section.slug,
    );
    if (docs.length === 0) return [];
    return [
      {
        slug: section.slug,
        label: section.label,
        href: buildDocHref(
          product,
          version,
          section.slug === "__root__" ? [] : [section.slug],
        ),
        collapsed: section.collapsed,
        items: docs.map((doc) => ({
          href: buildDocHref(product, version, doc.slugSegments),
          title: doc.frontmatter.sidebarLabel,
          slug: doc.slug,
          description: doc.frontmatter.description,
        })),
      },
    ];
  });
}

export async function getDocByVersionAndSlug(
  product: string,
  version: string,
  slug: string,
): Promise<DocRecord | null> {
  return (
    (await getDocsStore()).byProduct
      .get(product)
      ?.get(version)
      ?.docsBySlug.get(slug) ?? null
  );
}

export function buildDocHref(
  productId: string,
  version: string,
  slugSegments: string[],
): string {
  const product = getDocsProduct(productId);
  if (!product) throw new Error(`Unknown docs product: ${productId}`);
  return toDocsPath([
    productId,
    ...(version === product.latestVersion ? [] : [version]),
    ...slugSegments,
  ]);
}

export async function getDocsSearchIndex(): Promise<DocsSearchEntry[]> {
  const entries: DocsSearchEntry[] = [];
  for (const versions of (await getDocsStore()).byProduct.values()) {
    for (const versionDocs of versions.values()) {
      const { product, version } = versionDocs;
      for (const doc of versionDocs.docs) {
        const href = buildDocHref(product.id, version, doc.slugSegments);
        const base = {
          product: product.id,
          productLabel: product.label,
          isLatest: version === product.latestVersion,
          keywords: doc.frontmatter.keywords,
          version,
        };
        entries.push({
          ...base,
          href,
          title: doc.frontmatter.title,
          description: doc.frontmatter.description,
          section:
            versionDocs.sections.find(
              (section) => section.slug === doc.sectionSlug,
            )?.label ?? null,
          content: doc.content,
        });
        for (const section of getDocsSearchSections(doc.content)) {
          entries.push({
            ...base,
            href: `${href}#${section.id}`,
            title: section.text,
            description: doc.frontmatter.title,
            section: doc.frontmatter.title,
            content: section.content,
          });
        }
      }
    }
  }
  return entries;
}

export async function generateDocsStaticParams(): Promise<
  Array<{ slug: string[] }>
> {
  const unique = new Map<string, string[]>([["", []]]);
  const add = (segments: string[]) => unique.set(segments.join("/"), segments);
  for (const versions of (await getDocsStore()).byProduct.values()) {
    for (const versionDocs of versions.values()) {
      const { product, version } = versionDocs;
      const slugs = new Set([
        "",
        ...versionDocs.docs.map((doc) => doc.slug),
        ...versionDocs.sections.map((section) => section.slug),
        ...Object.keys(product.legacyRedirects[version] ?? {}),
      ]);
      for (const slug of slugs) {
        const segments = slug.split("/").filter(Boolean);
        add(
          buildDocHref(product.id, version, segments)
            .slice("/docs/".length)
            .split("/"),
        );
        add([product.id, version, ...segments]);
        if (product.id === "sdk") {
          add([version, ...segments]);
          if (version === product.latestVersion && slug) add(segments);
        } else if (product.id === "studio") {
          add([version, "studio", ...segments]);
        }
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
  if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
  const [targetPath, hash] = href.split("#", 2);
  if (!targetPath?.endsWith(".md")) return href;
  const normalizedTarget = path.posix.normalize(
    path.posix.join(path.posix.dirname(currentRelativeFile), targetPath),
  );
  const targetDoc =
    versionDocs.docsByRelativeFile.get(normalizedTarget) ??
    versionDocs.docsByNormalizedRelativeFile.get(
      normalizeRelativeMdPath(normalizedTarget),
    ) ??
    versionDocs.linkedDocsBySourceFile.get(
      path.resolve(versionDocs.root, normalizedTarget),
    );
  if (!targetDoc) return href;
  const targetHref = buildDocHref(
    targetDoc.product,
    targetDoc.product === versionDocs.product.id ? version : targetDoc.version,
    targetDoc.slugSegments,
  );
  return hash ? `${targetHref}#${hash}` : targetHref;
}
