import { siteConfig } from "@/lib/site";

export const openGraphImageSize = {
  width: 1200,
  height: 630,
};

export function KortyxOgCard({
  eyebrow,
  title,
  description,
  logoSrc,
}: {
  eyebrow: string;
  title: string;
  description: string;
  logoSrc: string | null;
}) {
  return (
    <div
      style={{
        alignItems: "stretch",
        background: "#08090a",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, Arial, sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "18px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#f8fafc",
            borderRadius: "14px",
            color: "#08090a",
            display: "flex",
            fontSize: "32px",
            fontWeight: 800,
            height: "54px",
            justifyContent: "center",
            lineHeight: 1,
            width: "54px",
          }}
        >
          {logoSrc ? (
            // biome-ignore lint/performance/noImgElement: next/og ImageResponse renders image markup directly and cannot use next/image.
            <img
              alt=""
              src={logoSrc}
              style={{
                height: "42px",
                width: "42px",
              }}
            />
          ) : (
            "K"
          )}
        </div>
        <div
          style={{
            color: "#f8fafc",
            fontSize: "42px",
            fontWeight: 700,
          }}
        >
          {siteConfig.name}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <div
          style={{
            color: "#93c5fd",
            fontSize: "30px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            color: "#f8fafc",
            fontSize: "78px",
            fontWeight: 750,
            lineHeight: 1,
            maxWidth: "980px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: "#cbd5e1",
            fontSize: "30px",
            lineHeight: 1.35,
            maxWidth: "900px",
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}
