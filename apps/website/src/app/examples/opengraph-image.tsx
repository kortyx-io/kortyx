import { createMarketingOgImage } from "@/lib/marketing-og-image";
import { openGraphImageSize } from "@/lib/og-card";

export const alt = "Kortyx agent workflow examples";
export const size = openGraphImageSize;
export const contentType = "image/png";

export default function Image() {
  return createMarketingOgImage({
    eyebrow: "Workflow examples",
    title: "Build an agent workflow people can review.",
    description:
      "Follow a refund request from tool call to typed decision, human approval, and resumed execution.",
  });
}
