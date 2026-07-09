// scripts/export/export-posts.ts
import { JWT } from "google-auth-library"
import * as fs from "fs"
import * as path from "path"

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const MAX_SLUG_LENGTH = 80 // OS safe, SEO friendly

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
  // Cap at MAX_SLUG_LENGTH — prevents ENAMETOOLONG on Vercel/OS
  return raw.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "")
}

function stripThinkingBlocks(text: string): string {
  // Remove <think>...</think> blocks from Qwen/gpt-oss reasoning models
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\n]+/, "")
    .trim()
}

function hasUnclosedThinkingBlock(text: string): boolean {
  // Groq sometimes truncates a reasoning model's response at the max_tokens
  // limit before it emits </think>. When that happens the ENTIRE response is
  // raw chain-of-thought with no closing tag, so stripThinkingBlocks() can't
  // remove it (its regex requires a matching close). Detect that case here
  // so the caller can treat it as a failed generation instead of publishing
  // raw reasoning text.
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

  // If the reasoning block got cut off mid-thought, there's no usable
  // output at all — don't try to salvage it, just fall back to base content.
  const aiTitle = hasUnclosedThinkingBlock(rawAiTitle) ? "" : stripThinkingBlocks(rawAiTitle)
  const aiContent = hasUnclosedThinkingBlock(rawAiContent) ? "" : stripThinkingBlocks(rawAiContent)

  const finalTitle = isValidAiOutput(aiTitle) ? aiTitle : titleBase
  const finalContent = isValidAiOutput(aiContent) ? aiContent : contentBase

  const categoryRaw = String(row[6] || "").trim()

  // Use existing slug if valid length, otherwise regenerate and cap
  const rawSlug = slugBase && slugBase.length <= MAX_SLUG_LENGTH
    ? slugBase
    : safeSlug(finalTitle)

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

async function exportPosts() {
  console.log("📥 Fetching published posts from Google Sheets...")

  const rows = await fetchSheetData("FINAL_BLOGS!A2:Q")

  const posts = rows
    .filter((row) => {
      const isPublished = row[9] === true || String(row[9]).toUpperCase() === "TRUE"
      const status = String(row[13] || "").toUpperCase()
      return isPublished && status === "LIVE"
    })
    .map(rowToPost)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  // Deduplicate slugs — if two articles have same slug after truncation, append index
  const seenSlugs = new Map<string, number>()
  posts.forEach((post) => {
    const count = seenSlugs.get(post.slug) || 0
    if (count > 0) {
      post.slug = `${post.slug}-${count}`
    }
    seenSlugs.set(post.slug, count + 1)
  })

  console.log(`✅ ${posts.length} published posts found`)

  const dataDir = path.join(process.cwd(), "data")
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const outputPath = path.join(dataDir, "posts.json")
  fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2), "utf-8")

  console.log(`📄 Exported to ${outputPath}`)
  console.log(`🕒 Timestamp: ${new Date().toISOString()}`)
}

exportPosts().catch((err) => {
  console.error("❌ Export failed:", err)
  process.exit(1)
})