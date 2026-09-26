// app/news/[slug]/opengraph-image.tsx
// Generates a branded 1200x630 image per article (headline + category +
// logo) so links shared to Twitter/X, Facebook, LinkedIn, WhatsApp, etc.
// show the actual story instead of a blank card or one generic image.
// Twitter cards fall back to this same image automatically since the
// article page's metadata sets card: "summary_large_image" but no
// explicit twitter image — Next.js uses opengraph-image for both.
import { ImageResponse } from "next/og"
import { getPostBySlug, getAllPosts } from "@/lib/data-source"
import { getLogoDataUrl } from "@/lib/og-logo"

export const runtime = "nodejs"
export const revalidate = false

// Mirrors page.tsx's own generateStaticParams: pre-renders an image at
// build time for every post in the "recent window" (data/posts.json).
// Archived posts (outside that window) generate their image on first
// request instead, then it's cached — same pattern as the article page
// itself (dynamicParams).
export async function generateStaticParams() {
  const posts = await getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export const alt = "AutoBrief news article"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Mirrors the color mapping in app/category/[slug]/page.tsx's CATEGORY_META
// so a shared article's image matches the site's own category colors.
// Satori (which renders these images) can't read Tailwind classes or
// globals.css, so the same palette is repeated here as plain hex.
const CATEGORY_COLORS: Record<string, string> = {
  world: "#3b82f6",
  technology: "#8b5cf6",
  science: "#06b6d4",
  business: "#10b981",
  health: "#f43f5e",
  environment: "#22c55e",
  politics: "#f97316",
  sports: "#eab308",
  entertainment: "#ec4899",
  space: "#6366f1",
}
const DEFAULT_ACCENT = "#38bdf8"

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text
}

interface Props {
  params: Promise<{ slug: string }>
}

export default async function Image({ params }: Props) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  const logo = getLogoDataUrl()

  const title = truncate(post?.title || "AutoBrief", 140)
  const category = post?.category || ""
  const accent = CATEGORY_COLORS[post?.categorySlug || ""] || DEFAULT_ACCENT

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a0a 0%, #111827 100%)",
          padding: "68px",
        }}
      >
        {/* top row: category badge + logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {category ? (
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 600,
                color: "#0a0a0a",
                background: accent,
                padding: "8px 22px",
                borderRadius: 999,
              }}
            >
              {category.toUpperCase()}
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={40} height={32} style={{ objectFit: "contain" }} alt="" />
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#ffffff" }}>
              AutoBrief
            </div>
          </div>
        </div>

        {/* headline */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.28,
            color: "#ffffff",
            letterSpacing: "-0.01em",
            overflow: "hidden",
          }}
        >
          {title}
        </div>

        {/* footer */}
        <div style={{ display: "flex", fontSize: 22, color: "#9ca3af" }}>
          autobrief.blog
        </div>
      </div>
    ),
    { ...size }
  )
}
