import { ImageResponse } from "next/og";
import { getOgLogoDataUri } from "@/lib/og-assets";
import { KortyxOgCard, openGraphImageSize } from "@/lib/og-card";

export async function createMarketingOgImage({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  const logoSrc = await getOgLogoDataUri();

  return new ImageResponse(
    <KortyxOgCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      logoSrc={logoSrc}
    />,
    openGraphImageSize,
  );
}
