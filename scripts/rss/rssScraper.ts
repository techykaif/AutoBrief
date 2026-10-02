// scripts/rss/rssScraper.ts
// Reads enabled sources from SOURCES sheet
// Run insertSources.ts first to populate the sheet

import "dotenv/config"
import Parser from "rss-parser"
import { getWriteAccessToken } from "../googleSheets"

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "AutoBrief RSS Reader/1.0 (https://autobrief-ai.netlify.app)",
  },
})

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

if (!SHEET_ID) {
  console.error("❌ Missing GOOGLE_SHEET_ID")
  process.exit(1)
}

/* =========================
   SHEETS HELPERS
   ========================= */

async function fetchSheet(range: string): Promise<any[][]> {
  const token = await getWriteAccessToken()

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.values || []
}

async function updateSourceLastFetched(values: string[][]): Promise<void> {
  if (!values.length) return

  const token = await getWriteAccessToken()
  const endRow = values.length + 1
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SOURCES!F2:F${endRow}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  )

  if (!res.ok) {
    console.error("Failed to update SOURCES.last_fetched:", await res.text())
  }
}

async function appendRows(rows: any[][]): Promise<number> {
  if (!rows.length) return 0

  const token = await getWriteAccessToken()

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/RAW_NEWS!A:H:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    }
  )

  if (!res.ok) {
    console.error("Failed to append rows:", await res.text())
    return 0
  }

  return rows.length
}

/* =========================
   ID HELPERS
   ========================= */

function getTodayPrefix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "")
}

function generateNextId(lastId?: string) {
  const today = getTodayPrefix()

  if (!lastId || !lastId.startsWith(today)) {
    return `${today}-001`
  }

  const parts = lastId.split("-")
  const lastSerial = parseInt(parts[parts.length - 1], 10)
  return `${today}-${String(lastSerial + 1).padStart(3, "0")}`
}

/* =========================
   CONTENT CLEANER
   ========================= */

function cleanContent(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/* =========================
   MAIN SCRAPER
   ========================= */

export async function runRssScraper() {
  console.log("🚀 Starting RSS scraper...")

  // Load enabled sources from SOURCES sheet
  // Columns: source_id, source_name, rss_url, category, enabled, last_fetched
  const sourceRows = await fetchSheet("SOURCES!A2:F")
  const enabledSources = sourceRows
    .map((r, index) => ({
      sourceIndex: index,
      enabled: String(r[4] || "").trim().toUpperCase() === "TRUE",
      name: String(r[1] || "").trim(),
      url: String(r[2] || "").trim(),
      category: String(r[3] || "").trim(),
    }))
    .filter(s => s.enabled && s.name && s.url.startsWith("http"))

  // Preserve existing timestamps and update only sources whose RSS fetch succeeds.
  const lastFetchedValues = sourceRows.map(r => [String(r[5] || "").trim()])

  console.log(`📡 Scraping ${enabledSources.length} enabled sources...`)

  // Load existing URLs to prevent duplicates
  const existingUrls = new Set(
    (await fetchSheet("RAW_NEWS!D2:D"))
      .flat()
      .map(v => String(v).trim())
  )

  // Get last ID for sequential generation
  const idRows = await fetchSheet("RAW_NEWS!A2:A")
  let lastId = idRows.length > 0
    ? String(idRows[idRows.length - 1][0]).trim()
    : undefined

  const rowsToInsert: any[][] = []
  const failedSources: string[] = []

  for (const source of enabledSources) {
    try {
      console.log(`  📰 Fetching: ${source.name}`)
      const feed = await parser.parseURL(source.url)
      lastFetchedValues[source.sourceIndex] = [new Date().toISOString()]

      let inserted = 0

      for (const item of feed.items.slice(0, 8)) {
        const title = typeof item.title === "string" ? item.title.trim() : ""
        const link = typeof item.link === "string" ? item.link.trim() : ""

        const rawContent =
          item.content ||
          item.contentSnippet ||
          item.summary ||
          ""

        const content = cleanContent(String(rawContent))

        // Quality filters
        if (title.length < 10) continue
        if (!link.startsWith("http")) continue
        if (content.length < 30) continue
        if (existingUrls.has(link)) continue

        const newId = generateNextId(lastId)
        lastId = newId

        rowsToInsert.push([
          newId,
          source.name,
          title,
          link,
          content,
          source.category,
          new Date().toISOString(),
          "NEW",
        ])

        existingUrls.add(link)
        inserted++
      }

      if (inserted > 0) {
        console.log(`    ✅ ${inserted} new articles from ${source.name}`)
      } else {
        console.log(`    ⏭️  No new articles from ${source.name}`)
      }

    } catch (err: any) {
      console.error(`    ❌ Failed: ${source.name} - ${err.message}`)
      failedSources.push(source.name)
    }
  }

  // Batch insert
  if (rowsToInsert.length > 0) {
    await appendRows(rowsToInsert)
    console.log(`\n✅ Inserted ${rowsToInsert.length} new articles into RAW_NEWS`)
  } else {
    console.log("\n📭 No new articles found this run")
  }

  if (sourceRows.length > 0) {
    await updateSourceLastFetched(lastFetchedValues)
    console.log("🕒 Updated SOURCES.last_fetched for successful RSS fetches")
  }

  if (failedSources.length > 0) {
    console.log(`\n⚠️  Failed sources (${failedSources.length}): ${failedSources.join(", ")}`)
  }

  console.log("🎉 Scraper complete.")
}

runRssScraper()
