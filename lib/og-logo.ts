// lib/og-logo.ts
// next/og's ImageResponse (Satori) can't load images by plain file path or
// relative URL — an <img> needs a remote URL or a base64 data: URI. Reading
// the file and caching the data URI here means opengraph-image routes only
// touch disk once per server instance instead of on every image render.
import { readFileSync } from "fs"
import path from "path"

let cached: string | null = null

export function getLogoDataUrl(): string {
  if (cached) return cached
  const bytes = readFileSync(path.join(process.cwd(), "public", "logo.png"))
  cached = `data:image/png;base64,${bytes.toString("base64")}`
  return cached
}
