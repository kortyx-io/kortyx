import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kortyx",
    short_name: "Kortyx",
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#08080c",
    theme_color: "#7657ff",
    icons: [
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
