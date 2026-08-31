import { createMarketingOgImage } from "@/lib/marketing-og-image";
import { openGraphImageSize } from "@/lib/og-card";

export const alt = "Kortyx TypeScript agent runtime";
export const size = openGraphImageSize;
export const contentType = "image/png";

export default function Image() {
  return createMarketingOgImage({
    eyebrow: "Product",
    title: "Keep the server run and React UI in sync.",
    description:
      "Typed workflows, streamed state, human interrupts, persistence, resume, rollback, and fork.",
  });
}
