import { createHash } from "node:crypto";
import {
  type CloudLegalDocument,
  getCloudLegalDocument,
  getCloudLegalDocuments,
  hashCloudLegalDocument,
} from "./cloud-legal";
import { getWebsiteLegalReleases } from "./legal-documents";

type Product = "cloud" | "website";
export type WebsiteRelease = ReturnType<typeof getWebsiteLegalReleases>[number];
export type FeedEntry = {
  documentId: string;
  product: Product;
  category: string;
  currentVersion: string;
  version: string;
  effectiveDate: string;
  title: string;
  hash: string;
  contentFormat: "plain-text-v1" | "markdown-v1" | "website-content-v1";
  hashContract?: string;
  productionApproved: boolean;
  websiteRelease?: Omit<WebsiteRelease, "content">;
};
export type PublishedLegal = {
  entry: FeedEntry;
  bytes: string;
  document?: CloudLegalDocument;
  websiteRelease?: WebsiteRelease;
  history: { version: string; date: string; url: string }[];
};
export function legalFeedConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const environment = env.WEBSITE_LEGAL_ENVIRONMENT;
  const base = env.WEBSITE_LEGAL_SERVICE_URL;
  const key = env.WEBSITE_LEGAL_SERVICE_KEY;
  if (!environment && !base && !key) return null;
  if (
    !["staging", "production"].includes(environment ?? "") ||
    !base ||
    !/^[A-Za-z0-9_-]{43,512}$/.test(key ?? "")
  )
    throw new Error("Configure the complete website legal feed");
  const url = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/api/legal")
  )
    throw new Error("Invalid website legal service URL");
  return { environment: environment!, base: url.href, key: key! };
}
const pathFor = (product: Product, slug: string) =>
  product === "cloud" ? `/cloud/${slug}` : `/${slug}`;
function validEntry(value: FeedEntry): boolean {
  return (
    !!value &&
    ["cloud", "website"].includes(value.product) &&
    new RegExp(`^kortyx\\.${value.product}\\.[a-z][a-z0-9-]{1,60}$`).test(
      value.documentId,
    ) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value.version) &&
    value.version !== "current" &&
    typeof value.currentVersion === "string" &&
    /^[a-f0-9]{64}$/.test(value.hash) &&
    ["plain-text-v1", "markdown-v1", "website-content-v1"].includes(
      value.contentFormat,
    ) &&
    typeof value.title === "string" &&
    typeof value.effectiveDate === "string"
  );
}
export function createLegalFeed(
  config: NonNullable<ReturnType<typeof legalFeedConfig>>,
  fetcher = fetch,
) {
  async function request(path: string) {
    const response = await fetcher(`${config.base}${path}`, {
      headers: { authorization: `Bearer ${config.key}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (
      response.headers.get("x-kortyx-consent-tenant") !==
      `kortyx-cloud-${config.environment}`
    )
      throw new Error("Legal feed environment mismatch");
    if (!response.ok) throw new Error("Legal documents are unavailable");
    return response;
  }
  async function list() {
    const { documents } = await (await request("/manifest")).json();
    if (!Array.isArray(documents) || !documents.every(validEntry))
      throw new Error("Invalid legal manifest");
    const entries = documents as FeedEntry[];
    if (
      new Set(entries.map((x) => `${x.documentId}@${x.version}`)).size !==
      entries.length
    )
      throw new Error("Duplicate legal manifest release");
    return entries;
  }
  async function read(
    product: Product,
    slug: string,
    version?: string,
  ): Promise<PublishedLegal | null> {
    if (
      !/^[a-z][a-z0-9-]{1,60}$/.test(slug) ||
      (version && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(version))
    )
      return null;
    const entries = (await list()).filter(
      (item) => item.documentId === `kortyx.${product}.${slug}`,
    );
    if (new Set(entries.map((x) => x.currentVersion)).size > 1)
      throw new Error("Ambiguous current legal document");
    const entry = entries.find(
      (item) => item.version === (version ?? item.currentVersion),
    );
    if (!entry) return null;
    const response = await request(`/${product}/${slug}/${entry.version}`);
    const bytes = await response.text();
    if (
      bytes.length > 1_000_000 ||
      createHash("sha256").update(bytes, "utf8").digest("hex") !== entry.hash ||
      response.headers.get("x-content-sha256") !== entry.hash ||
      response.headers.get("x-legal-content-format") !== entry.contentFormat
    )
      throw new Error("Legal document integrity mismatch");
    const expectedContract =
      entry.contentFormat === "website-content-v1"
        ? "kortyx-website-content-sha256-v1"
        : "kortyx-cloud-json-sha256-v1";
    if (
      response.headers.get("x-legal-hash-contract") !== expectedContract ||
      (entry.hashContract && entry.hashContract !== expectedContract)
    )
      throw new Error("Unsupported legal hash contract");
    const payload = JSON.parse(bytes);
    // Compare known historical publications with their original checked-in hashes.
    const historical =
      product === "cloud"
        ? getCloudLegalDocument(slug, entry.version)
        : getWebsiteLegalReleases().find(
            (x) => x.id === entry.documentId && x.version === entry.version,
          );
    const historicalHash =
      historical &&
      ("hash" in historical
        ? historical.hash
        : hashCloudLegalDocument(historical));
    if (historicalHash && historicalHash !== entry.hash)
      throw new Error("Historical document changed");
    const history = entries
      .map((item) => ({
        version: item.version,
        date: item.effectiveDate,
        url: `${pathFor(product, slug)}/${item.version}`,
      }))
      .reverse();
    if (entry.contentFormat === "website-content-v1") {
      if (
        product !== "website" ||
        !entry.websiteRelease ||
        entry.websiteRelease.id !== entry.documentId ||
        entry.websiteRelease.version !== entry.version ||
        entry.websiteRelease.hash !== entry.hash ||
        typeof payload.title !== "string" ||
        typeof payload.description !== "string" ||
        !Array.isArray(payload.sections) ||
        payload.sections.some(
          (s: {
            id: unknown;
            title: unknown;
            paragraphs: unknown;
            links?: { href: string; label: unknown }[];
          }) =>
            typeof s.id !== "string" ||
            typeof s.title !== "string" ||
            !Array.isArray(s.paragraphs) ||
            s.paragraphs.some((p) => typeof p !== "string") ||
            s.links?.some(
              (l) =>
                typeof l.label !== "string" ||
                !/^(https:\/\/|\/(?!\/))/.test(l.href),
            ),
        )
      )
        throw new Error("Invalid website archive");
      return {
        entry,
        bytes,
        history,
        websiteRelease: { ...entry.websiteRelease, content: payload },
      };
    }
    if (
      payload.slug !== slug ||
      payload.version !== entry.version ||
      payload.title !== entry.title ||
      payload.effectiveDate !== entry.effectiveDate ||
      typeof payload.draft !== "boolean" ||
      !Array.isArray(payload.sections) ||
      payload.sections.some(
        (s: { title: unknown; text: unknown }) =>
          typeof s.title !== "string" || typeof s.text !== "string",
      )
    )
      throw new Error("Invalid legal document envelope");
    return { entry, bytes, history, document: payload };
  }
  return { list, read };
}
// Runtime server configuration only. No signing key, identity or acceptance API
// is sent to the browser. Configured feeds fail closed; they never fall back to
// an archive from a different environment when the service is unavailable.
export async function getPublishedLegal(
  product: Product,
  slug: string,
  version?: string,
): Promise<PublishedLegal | null> {
  const config = legalFeedConfig();
  if (config) return createLegalFeed(config).read(product, slug, version);
  if (product === "cloud") {
    const document = getCloudLegalDocument(slug, version);
    if (!document) return null;
    return {
      document,
      bytes: JSON.stringify(document),
      entry: {
        documentId: `kortyx.cloud.${slug}`,
        product,
        category: slug,
        currentVersion: document.version,
        version: document.version,
        effectiveDate: document.effectiveDate,
        title: document.title,
        hash: hashCloudLegalDocument(document),
        contentFormat: "plain-text-v1",
        productionApproved: false,
      },
      history: getCloudLegalDocuments()
        .filter((x) => x.slug === slug)
        .map((x) => ({
          version: x.version,
          date: x.effectiveDate,
          url: `/cloud/${slug}/${x.version}`,
        }))
        .reverse(),
    };
  }
  const all = getWebsiteLegalReleases().filter(
    (x) => x.id === `kortyx.website.${slug}`,
  );
  const release = version ? all.find((x) => x.version === version) : all.at(-1);
  if (!release) return null;
  return {
    websiteRelease: release,
    bytes: JSON.stringify(release.content),
    entry: {
      documentId: release.id,
      product,
      category: slug,
      currentVersion: all.at(-1)!.version,
      version: release.version,
      effectiveDate: release.updatedAt,
      title: release.content.title,
      hash: release.hash,
      contentFormat: "website-content-v1",
      productionApproved: false,
    },
    history: all
      .map((x) => ({
        version: x.version,
        date: x.updatedAt,
        url: `/${slug}/${x.version}`,
      }))
      .reverse(),
  };
}
