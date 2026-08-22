import type { MetadataRoute } from "next"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { getAllPosts } from "@/lib/data-source"

const SITE_URL = "https://autobrief-ai.vercel.app"

async function getArchiveSlugs(): Promise<string[]> {
  try {
    const filePath = path.join(process.cwd(), "data", "archive-index.json")
    const content = await readFile(filePath, "utf8")
    const index = JSON.parse(content) as Record<string, string>
    return Object.keys(index)
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [recentPosts, archiveSlugs] = await Promise.all([
    getAllPosts(),
    getArchiveSlugs(),
  ])

  const urls = new Set<string>()

  for (const post of recentPosts) {
    urls.add(`${SITE_URL}/news/${post.slug}`)
  }

  for (const slug of archiveSlugs) {
    urls.add(`${SITE_URL}/news/${slug}`)
  }

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/categories`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/disclaimer`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/dmca`, changeFrequency: "yearly", priority: 0.2 },
  ]

  const articlePages: MetadataRoute.Sitemap = Array.from(urls, (url) => ({
    url,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  return [...staticPages, ...articlePages]
}
