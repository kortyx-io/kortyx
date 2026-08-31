import { createMarketingOgImage } from "@/lib/marketing-og-image";
import { openGraphImageSize } from "@/lib/og-card";

export const alt = "Kortyx open-source TypeScript agent framework";
export const size = openGraphImageSize;
export const contentType = "image/png";

export default function Image() {
  return createMarketingOgImage({
    eyebrow: "Open source",
    title: "Run the framework on your infrastructure.",
    description:
      "Apache-2.0 runtime and React packages, optional self-hosted Studio, and no required cloud execution path.",
  });
}
