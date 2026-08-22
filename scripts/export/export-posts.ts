// scripts/export/export-posts.ts
import { JWT } from "google-auth-library"
import * as fs from "fs"
import * as path from "path"

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const MAX_SLUG_LENGTH = 80 // OS safe, SEO friendly
const RECENT_WINDOW_SIZE = 500
const SITEMAP_URL_LIMIT = 5000
const SITE_URL = "https://autobrief-ai.vercel.app"

function monthKey(isoDate: string): string {
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return "undated"
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

async function getAccessToken(): Promise<string> {
  const client = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const credentials = await client.authorize()
  if (!credentials.access_token) throw new Error("Failed to obtain access token")
  return credentials.access_token
}

async function fetchSheetData(range: string): Promise<any[][]> {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets fetch failed: ${await res.text()}`)
  const data = await res.json()
  return data.values || []
}

function slugifyCategory(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-")
}

function safeSlug(text: string): string {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return raw.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "")
}

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\n]+/, "")
    .trim()
}

function hasUnclosedThinkingBlock(text: string): boolean {
  const lower = text.toLowerCase()
  const openCount = (lower.match(/<think>/g) || []).length
  const closeCount = (lower.match(/<\/think>/g) || []).length
  return openCount > closeCount
}

function isValidAiOutput(value: string): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return (
    !value.startsWith("=") &&
    !lower.includes("=ai(") &&
    !lower.includes("write a short, clear") &&
    !lower.includes("write a clear and well-structured") &&
    !lower.includes("summarize the following news") &&
    !lower.includes("as an ai language model") &&
    !lower.includes("i cannot") &&
    !lower.includes("i'm unable")
  )
}

function rowToPost(row: any[]) {
  const titleBase = String(row[2] || "").trim()
  const slugBase = String(row[3] || "").trim()
  const contentBase = String(row[4] || "").trim()
  const rawAiTitle = String(row[16] || "").trim()
  const rawAiContent = String(row[15] || "").trim()

  const aiTitle = hasUnclosedThinkingBlock(rawAiTitle) ? "" : stripThinkingBlocks(rawAiTitle)
  const aiContent = hasUnclosedThinkingBlock(rawAiContent) ? "" : stripThinkingBlocks(rawAiContent)
  const finalTitle = isValidAiOutput(aiTitle) ? aiTitle : titleBase
  const finalContent = isValidAiOutput(aiContent) ? aiContent : contentBase
  const categoryRaw = String(row[6] || "").trim()
  const rawSlug = slugBase && slugBase.length <= MAX_SLUG_LENGTH ? slugBase : safeSlug(finalTitle)

  return {
    id: String(row[0] || ""),
    title: finalTitle,
    slug: rawSlug,
    content: finalContent,
    category: categoryRaw,
    categorySlug: slugifyCategory(categoryRaw),
    publishedAt: row[8] || new Date().toISOString(),
    author: String(row[7] || "").trim(),
    isFeatured: row[10] === true || String(row[10]).toUpperCase() === "TRUE",
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function sitemapUrlset(urls: string[]): string {
  const body = urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

function sitemapIndex(locations: string[]): string {
  const body = locations.map((url) => `  <sitemap><loc>${xmlEscape(url)}</loc></sitemap>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
}

function generateStaticSitemap(posts: typeof postsType, publicDir: string) {
  const sitemapDir = path.join(publicDir, "sitemaps")
  if (fs.existsSync(sitemapDir)) fs.rmSync(sitemapDir, { recursive: true, force: true })
  fs.mkdirSync(sitemapDir, { recursive: true })

  const urls = [
    SITE_URL,
    `${SITE_URL}/categories`,
    `${SITE_URL}/about`,
    `${SITE_URL}/privacy`,
    `${SITE_URL}/disclaimer`,
    `${SITE_URL}/dmca`,
    ...posts.map((post) => `${SITE_URL}/news/${post.slug}`),
  ]

  const sitemapFiles: string[] = []
  for (let i = 0; i < urls.length; i += SITEMAP_URL_LIMIT) {
    const fileNumber = Math.floor(i / SITEMAP_URL_LIMIT) + 1
    const filename = `sitemap-${fileNumber}.xml`
    fs.writeFileSync(path.join(sitemapDir, filename), sitemapUrlset(urls.slice(i, i + SITEMAP_URL_LIMIT)), "utf-8")
    sitemapFiles.push(`${SITE_URL}/sitemaps/${filename}`)
  }

  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemapIndex(sitemapFiles), "utf-8")
  console.log(`🗺️  Generated ${sitemapFiles.length} static sitemap file(s)`)
}

type Post = ReturnType<typeof rowToPost>
type postsType = Post[]

async function exportPosts() {
  console.log("📥 Fetching published posts from Google Sheets...")

  const rows = await fetchSheetData("FINAL_BLOGS!A2:Q")
  const posts: Post[] = rows
    .filter((row) => {
      const isPublished = row[9] === true || String(row[9]).toUpperCase() === "TRUE"
      const status = String(row[13] || "").toUpperCase()
      return isPublished && status === "LIVE"
    })
    .map(rowToPost)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  const seenSlugs = new Map<string, number>()
  posts.forEach((post) => {
    const baseSlug = post.slug
    const count = seenSlugs.get(baseSlug) || 0
    post.slug = count === 0 ? baseSlug : `${baseSlug}-${count}`
    seenSlugs.set(baseSlug, count + 1)
  })

  console.log(`✅ ${posts.length} published posts found`)

  const dataDir = path.join(process.cwd(), "data")
  const publicDir = path.join(process.cwd(), "public")
  const archiveDir = path.join(dataDir, "archive")
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

  const recentPosts = posts.slice(0, RECENT_WINDOW_SIZE)
  const archivedPosts = posts.slice(RECENT_WINDOW_SIZE)

  fs.writeFileSync(path.join(dataDir, "posts.json"), JSON.stringify(recentPosts, null, 2), "utf-8")

  if (fs.existsSync(archiveDir)) fs.rmSync(archiveDir, { recursive: true, force: true })
  fs.mkdirSync(archiveDir, { recursive: true })

  const shards = new Map<string, Post[]>()
  const archiveIndex: Record<string, string> = {}
  for (const post of archivedPosts) {
    const key = monthKey(post.publishedAt)
    if (!shards.has(key)) shards.set(key, [])
    shards.get(key)!.push(post)
    archiveIndex[post.slug] = key
  }

  for (const [key, shardPosts] of shards) {
    fs.writeFileSync(path.join(archiveDir, `${key}.json`), JSON.stringify(shardPosts, null, 2), "utf-8")
  }

  fs.writeFileSync(path.join(dataDir, "archive-index.json"), JSON.stringify(archiveIndex), "utf-8")
  fs.writeFileSync(
    path.join(dataDir, "meta.json"),
    JSON.stringify({
      totalPosts: posts.length,
      recentCount: recentPosts.length,
      archivedCount: archivedPosts.length,
      archiveMonths: Array.from(shards.keys()).sort().reverse(),
      generatedAt: new Date().toISOString(),
    }, null, 2),
    "utf-8"
  )

  generateStaticSitemap(posts, publicDir)
  console.log(`🗄️  Archived ${archivedPosts.length} posts across ${shards.size} monthly shard(s)`)
  console.log(`🕒 Timestamp: ${new Date().toISOString()}`)
}

exportPosts().catch((err) => {
  console.error("❌ Export failed:", err)
  process.exit(1)
})
