import { packageMetadata } from "./registry.mjs";

const packages = JSON.parse(process.env.RELEASE_PACKAGES || "[]");
const distTag = process.env.RELEASE_DIST_TAG || "latest";
if (packages.length === 0) {
  console.log("No npm packages need registry verification.");
  process.exit(0);
}

// npm scans accepted uploads before making them installable. Its documented
// processing window can exceed 15 minutes; keep polling without republishing.
const deadline = Date.now() + 30 * 60 * 1000;
let delay = 2_000;
const pending = new Map(packages.map((pkg) => [pkg.name, pkg.version]));

while (pending.size > 0 && Date.now() < deadline) {
  for (const [name, version] of pending) {
    try {
      const metadata = await packageMetadata(name);
      if (
        metadata?.versions?.[version] &&
        metadata["dist-tags"]?.[distTag] === version
      ) {
        console.log(`Verified ${name}@${version} and its ${distTag} dist-tag.`);
        pending.delete(name);
      }
    } catch {
      // Registry propagation is eventually consistent; retry until the deadline.
    }
  }

  if (pending.size > 0) {
    console.log(
      `Waiting for npm propagation: ${[...pending].map(([name, version]) => `${name}@${version}`).join(", ")}`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.7), 30_000);
  }
}

if (pending.size > 0) {
  throw new Error(
    `npm registry did not expose the expected versions and ${distTag} tags within 30 minutes: ${[
      ...pending,
    ]
      .map(([name, version]) => `${name}@${version}`)
      .join(", ")}. Check npm processing status before retrying publication.`,
  );
}
