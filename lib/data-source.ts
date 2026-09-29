// lib/data-source.ts
// Uses lazy imports so google-sheets.ts is NEVER loaded when provider === "static"
// This prevents any Sheets API calls at runtime on the deployed site

const provider = process.env.DATA_PROVIDER || "static"

async function getService() {
  if (provider === "sheets") {
    return await import("./google-sheets")
  }
  return await import("./static-data")
}

export async function getPublishedPosts(page?: number, limit?: number) {
  const s = await getService()
  return s.getPublishedPosts(page, limit)
}

export async function getPostBySlug(slug: string) {
  const s = await getService()
  return s.getPostBySlug(slug)
}

export async function getPostsByCategory(categorySlug: string) {
  const s = await getService()
  return s.getPostsByCategory(categorySlug)
}

export async function getCategories() {
  const s = await getService()
  return s.getCategories()
}

export async function getDatasetMeta() {
  const s = await import("./static-data")
  return s.getDatasetMeta()
}

export async function getFeaturedPosts() {
  const s = await getService()
  return s.getFeaturedPosts()
}

export async function getBreakingNews() {
  const s = await getService()
  return s.getBreakingNews()
}

export async function searchPosts(query: string) {
  const s = await getService()
  return s.searchPosts(query)
}

export async function getAllPosts() {
  const s = await getService()
  return s.getAllPosts()
}
