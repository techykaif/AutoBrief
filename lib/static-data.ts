// lib/static-data.ts
import type { NewsPost, Category } from "./types"

let cachedPosts: NewsPost[] | null = null
let cachedArchiveIndex: Record<string, string> | null = null
const shardCache = new Map<string, NewsPost[]>()

function slugifyCategory(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-")
}

function calcReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

function withReadingTime(p: NewsPost): NewsPost {
  return { ...p, readingTime: calcReadingTime(p.content || "") }
}

function loadPosts(): NewsPost[] {
  if (cachedPosts) return cachedPosts

  try {
    const data = require("../data/posts.json")
    cachedPosts = Array.isArray(data) ? data.map(withReadingTime) : []
  } catch {
    console.warn("⚠️ data/posts.json not found — returning empty array")
    cachedPosts = []
  }

  return cachedPosts!
}

// data/archive-index.json maps slug -> "YYYY-MM" so a lookup for an
// archived post only ever loads the one monthly shard that contains it,
// instead of scanning every shard on disk.
function loadArchiveIndex(): Record<string, string> {
  if (cachedArchiveIndex) return cachedArchiveIndex
  try {
    cachedArchiveIndex = require("../data/archive-index.json")
  } catch {
    cachedArchiveIndex = {}
  }
  return cachedArchiveIndex!
}

function loadArchiveShard(month: string): NewsPost[] {
  const cached = shardCache.get(month)
  if (cached) return cached

  try {
    const data = require(`../data/archive/${month}.json`)
    const shard = Array.isArray(data) ? data.map(withReadingTime) : []
    shardCache.set(month, shard)
    return shard
  } catch {
    shardCache.set(month, [])
    return []
  }
}

// Looks up a post that has aged out of the recent window in data/posts.json.
// Used as a fallback so /news/[slug] can still resolve (and cache) archived
// articles on first request even though they're no longer statically
// prerendered.
function findArchivedPost(slug: string): NewsPost | null {
  const month = loadArchiveIndex()[slug]
  if (!month) return null
  return loadArchiveShard(month).find((p) => p.slug === slug) || null
}

export async function getPublishedPosts(page = 1, limit = 20): Promise<NewsPost[]> {
  const posts = loadPosts()
  const start = (page - 1) * limit
  return posts.slice(start, start + limit)
}

export async function getPostBySlug(slug: string): Promise<NewsPost | null> {
  const posts = loadPosts()
  const recentMatch = posts.find((p) => p.slug === slug)
  if (recentMatch) return recentMatch
  return findArchivedPost(slug)
}

export async function getPostsByCategory(categorySlug: string): Promise<NewsPost[]> {
  const posts = loadPosts()
  return posts.filter((p) => {
    if (!p.category) return false
    return slugifyCategory(p.category) === categorySlug
  })
}

export async function getCategories(): Promise<Category[]> {
  const posts = loadPosts()
  const map = new Map<string, number>()
  posts.forEach((p) => {
    const name = String(p.category || "").trim()
    if (!name) return
    map.set(name, (map.get(name) || 0) + 1)
  })
  return Array.from(map.entries()).map(([name, count]) => ({
    name,
    slug: slugifyCategory(name),
    count,
  }))
}

export async function getFeaturedPosts(): Promise<NewsPost[]> {
  const posts = loadPosts()
  // isFeatured flag OR just return latest 3 if none are flagged
  const featured = posts.filter((p) => p.isFeatured)
  return featured.length > 0 ? featured.slice(0, 3) : posts.slice(0, 3)
}

export async function getBreakingNews(): Promise<NewsPost | null> {
  const posts = loadPosts()
  return posts[0] || null
}

export async function searchPosts(query: string): Promise<NewsPost[]> {
  if (!query?.trim()) return []
  const q = query.trim().toLowerCase()
  const posts = loadPosts()
  return posts.filter((p) => {
    return (
      (p.title || "").toLowerCase().includes(q) ||
      (p.content || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q) ||
      (p.author || "").toLowerCase().includes(q)
    )
  })
}

export async function getAllPosts(): Promise<NewsPost[]> {
  return loadPosts()
}
