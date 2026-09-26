// app/opengraph-image.tsx
// Root-level Open Graph image. Next.js applies a route segment's
// opengraph-image to that segment and any nested segment that doesn't
// define its own — so this one covers the homepage, /about, /categories,
// /category/[slug], /privacy, /disclaimer and /dmca. app/news/[slug] has
// its own opengraph-image.tsx (per-article) that overrides this default.
import { ImageResponse } from "next/og"
import { getLogoDataUrl } from "@/lib/og-logo"

export const runtime = "nodejs"
export const revalidate = false

export const alt = "AutoBrief — Automated News Aggregation"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  const logo = getLogoDataUrl()

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0a 0%, #111827 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={132} height={106} style={{ objectFit: "contain", marginBottom: 32 }} alt="" />
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
          AutoBrief
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#9ca3af" }}>
          Free, ad-free automated news
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 22, color: "#38bdf8" }}>
          Updated every 30 minutes · 50+ sources
        </div>
      </div>
    ),
    { ...size }
  )
}
