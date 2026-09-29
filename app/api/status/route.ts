/* /api/status/route.ts */
// Returns site stats: total visits, article count, last updated, categories
// Reads from Google Sheets ANALYTICS tab + data/posts.json

import { NextResponse } from "next/server"
import { JWT } from "google-auth-library"
import { getCategories, getDatasetMeta } from "@/lib/data-source"

export const runtime = "nodejs"

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

async function getAccessToken(): Promise<string> {
  const client = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const credentials = await client.authorize()
  if (!credentials.access_token) throw new Error("No token")
  return credentials.access_token
}

async function getVisitCount(): Promise<number> {
  try {
    const token = await getAccessToken()
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("ANALYTICS!B2")}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return 0
    const data = await res.json()
    const val = data.values?.[0]?.[0]
    return val ? parseInt(val, 10) : 0
  } catch {
    return 0
  }
}

export async function GET() {
  try {
    const [meta, categories, visits] = await Promise.all([
      getDatasetMeta(),
      getCategories(),
      getVisitCount(),
    ])

    const now = new Date()

    return NextResponse.json({
      totalArticles: meta.totalPosts,
      todayArticles: meta.todayArticles ?? 0,
      weekArticles: meta.weekArticles ?? 0,
      totalVisits: visits,
      categories: categories.length,
      categoryBreakdown: categories.slice(0, 5),
      lastUpdated: meta.lastUpdated ?? null,
      timestamp: now.toISOString(),
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" }
    })
  } catch (error) {
    console.error("Status API error:", error)
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 })
  }
}
