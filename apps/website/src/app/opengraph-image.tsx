import { ImageResponse } from "next/og";
import { getOgLogoDataUri } from "@/lib/og-assets";
import { KortyxOgCard, openGraphImageSize } from "@/lib/og-card";

export const alt = "Kortyx documentation";
export const size = openGraphImageSize;
export const contentType = "image/png";

export default async function Image() {
  const logoSrc = await getOgLogoDataUri();

  return new ImageResponse(
    <KortyxOgCard
      eyebrow="Documentation"
      title="Documentation for production AI agents"
      description="Explicit workflows, provider-owned models, streaming, interrupts, and runtime control for TypeScript teams."
      logoSrc={logoSrc}
    />,
    size,
  );
}
