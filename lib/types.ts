/**
 * NewsPost type definition
 * Source of truth for frontend rendering
 * Aligned with FINAL_BLOGS sheet
 */
export interface NewsPost {
  // Identity
  id: string
  title: string
  slug: string

  // Content
  content: string
  summary?: string

  // Classification
  category: string
  author?: string

  // Publishing
  publishedAt: string // ISO date string
  isFeatured?: boolean
  isBreaking?: boolean

  // Meta
  readingTime?: number // in minutes
  views?: number

  // Link to the original article this summary is based on (FINAL_BLOGS col S)
  sourceUrl?: string
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  data: T
  success: boolean
  error?: string
}

/**
 * Category aggregation type
 */
export interface Category {
  name: string
  slug: string
  count: number
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: "OK" | "ERROR"
  timestamp: string
  version: string
}
