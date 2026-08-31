import { ImageResponse } from "next/og";
import { getOgLogoDataUri } from "@/lib/og-assets";
import { KortyxOgCard, openGraphImageSize } from "@/lib/og-card";

export const alt = "Kortyx, the TypeScript application framework for agents";
export const size = openGraphImageSize;
export const contentType = "image/png";

export default async function Image() {
  const logoSrc = await getOgLogoDataUri();

  return new ImageResponse(
    <KortyxOgCard
      eyebrow="TypeScript framework for agents"
      title="Write the agent logic. The runtime is already built."
      description="Define workflows, stream typed state to React, pause for human input, and resume the same run."
      logoSrc={logoSrc}
    />,
    size,
  );
}
