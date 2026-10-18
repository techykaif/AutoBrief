// scripts/rss/rssScraper.ts
// Reads enabled sources from SOURCES sheet
// Run insertSources.ts first to populate the sheet

import "dotenv/config"
import Parser from "rss-parser"
import { getWriteAccessToken } from "../googleSheets"
import {
  cleanContent,
  classifyPublicationDate,
  countWords,
  normalizeUrlForDedup,
  selectFeedContent,
} from "./contentUtils"

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "AutoBrief RSS Reader/1.0 (https://autobrief-ai.netlify.app)",
  },
})

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const MAX_NEW_ITEMS_PER_SOURCE = 8
const MAX_FEED_ITEMS_TO_INSPECT = 100
const MIN_CONTENT_CHARS = 30
const MAX_PUBLISHED_AGE_DAYS = 7

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

/**
 * Keep publication date separate from scraped_at. The Apps Script processor
 * must validate when a story was published, not when our crawler ingested it.
 */
async function ensurePublishedAtHeader(): Promise<void> {
  const values = await fetchSheet("RAW_NEWS!I1:I1")
  const current = String(values[0]?.[0] || "").trim()

  if (current && current.toLowerCase() !== "published_at") {
    throw new Error(
      `RAW_NEWS!I1 is already "${current}"; expected an empty cell or "published_at". Refusing to overwrite it.`
    )
  }

  if (current.toLowerCase() === "published_at") return

  const token = await getWriteAccessToken()
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/RAW_NEWS!I1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [["published_at"]] }),
    }
  )

  if (!res.ok) throw new Error("Failed to create RAW_NEWS published_at header: " + await res.text())
  console.log("🗓️ Ensured RAW_NEWS column I header: published_at")
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
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/RAW_NEWS!A:I:append?valueInputOption=RAW`,
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
   MAIN SCRAPER
   ========================= */

export async function runRssScraper() {
  console.log("🚀 Starting RSS scraper...")

  // Ensure new raw rows keep the article publication date separately from ingest time.
  await ensurePublishedAtHeader()

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
      .map(v => normalizeUrlForDedup(v))
      .filter(Boolean)
  )

  // Get last ID for sequential generation
  const idRows = await fetchSheet("RAW_NEWS!A2:A")
  let lastId = idRows.length > 0
    ? String(idRows[idRows.length - 1][0]).trim()
    : undefined

  const rowsToInsert: any[][] = []
  const failedSources: string[] = []
  const contentFieldCounts: Record<string, number> = {}
  let itemsInspected = 0
  let duplicateItems = 0
  let invalidItems = 0
  let metadataOnlyItems = 0
  let stalePublishedDateItems = 0
  let undatedPublishedDateItems = 0
  let invalidPublishedDateItems = 0
  let futurePublishedDateItems = 0
  let tooShortItems = 0
  let acceptedShortItems = 0
  let feedInspectionCapsReached = 0

  for (const source of enabledSources) {
    try {
      console.log(`  📰 Fetching: ${source.name}`)
      const feed = await parser.parseURL(source.url)
      lastFetchedValues[source.sourceIndex] = [new Date().toISOString()]

      let inserted = 0
      const candidateItems = feed.items.slice(0, MAX_FEED_ITEMS_TO_INSPECT)

      // Inspect beyond already-seen items, up to a bounded window. The old
      // feed.items.slice(0, 8) happened before duplicate filtering, so a feed
      // with eight old entries could hide newer eligible stories further down.
      for (const item of candidateItems) {
        if (inserted >= MAX_NEW_ITEMS_PER_SOURCE) break
        itemsInspected++

        const title = typeof item.title === "string" ? item.title.trim() : ""
        const link = typeof item.link === "string" ? item.link.trim() : ""

        let parsedLink: URL | null = null
        try {
          parsedLink = new URL(link)
        } catch {
          parsedLink = null
        }

        if (title.length < 10 || !parsedLink || !["http:", "https:"].includes(parsedLink.protocol)) {
          invalidItems++
          continue
        }

        const dedupUrl = normalizeUrlForDedup(link)
        if (existingUrls.has(dedupUrl)) {
          duplicateItems++
          continue
        }

        // Never ingest known-stale or undated stories as if they were current.
        // Some feeds retain old posts in their first page for weeks or months.
        const publicationDate = item.isoDate || item.pubDate
        const publicationStatus = classifyPublicationDate(
          publicationDate,
          new Date(),
          MAX_PUBLISHED_AGE_DAYS
        )

        if (publicationStatus === "stale") {
          stalePublishedDateItems++
          continue
        }
        if (publicationStatus === "missing") {
          undatedPublishedDateItems++
          continue
        }
        if (publicationStatus === "invalid") {
          invalidPublishedDateItems++
          continue
        }
        if (publicationStatus === "future") {
          futurePublishedDateItems++
          continue
        }

        const selected = selectFeedContent(item)
        if (selected.metadataOnly) {
          metadataOnlyItems++
          continue
        }

        const content = cleanContent(selected.content)
        if (content.length < MIN_CONTENT_CHARS) {
          tooShortItems++
          continue
        }

        contentFieldCounts[selected.field] = (contentFieldCounts[selected.field] || 0) + 1
        if (countWords(content) < 50) acceptedShortItems++

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
          new Date(String(publicationDate)).toISOString(),
        ])

        existingUrls.add(dedupUrl)
        inserted++
      }

      if (feed.items.length > MAX_FEED_ITEMS_TO_INSPECT && inserted < MAX_NEW_ITEMS_PER_SOURCE) {
        feedInspectionCapsReached++
        console.log(
          `    ⚠️ Inspection cap reached for ${source.name}: checked ${MAX_FEED_ITEMS_TO_INSPECT} of ${feed.items.length} feed items`
        )
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
    const insertedRows = await appendRows(rowsToInsert)
    if (insertedRows !== rowsToInsert.length) {
      // A failed Sheet write must fail the action, not look like a successful scrape.
      throw new Error(`Failed to persist all prepared rows to RAW_NEWS (${insertedRows}/${rowsToInsert.length})`)
    }
    console.log(`\n✅ Inserted ${insertedRows} new articles into RAW_NEWS`)
  } else {
    console.log("\n📭 No new articles found this run")
  }

  console.log(
    "\n🔎 Feed quality audit: " +
    JSON.stringify({
      itemsInspected,
      duplicateItems,
      invalidItems,
      metadataOnlyItems,
      stalePublishedDateItems,
      undatedPublishedDateItems,
      invalidPublishedDateItems,
      futurePublishedDateItems,
      maxPublishedAgeDays: MAX_PUBLISHED_AGE_DAYS,
      tooShortItems,
      acceptedShortItemsUnder50Words: acceptedShortItems,
      selectedContentFields: contentFieldCounts,
      feedInspectionCapsReached,
    })
  )

  if (sourceRows.length > 0) {
    await updateSourceLastFetched(lastFetchedValues)
    console.log("🕒 Updated SOURCES.last_fetched for successful RSS fetches")
  }

  if (failedSources.length > 0) {
    console.log(`\n⚠️  Failed sources (${failedSources.length}): ${failedSources.join(", ")}`)
  }

  console.log("🎉 Scraper complete.")
}

// This file is a one-shot CLI for GitHub Actions. All sheet reads/writes are awaited
// before runRssScraper resolves. Some RSS HTTP transports can leave idle sockets
// alive after the work has finished, keeping the action step spinning for minutes.
// Flush the action logs before forcing exit, so the final diagnostics are preserved.
function exitAfterLogFlush(code: number): void {
  let pending = 2
  const finish = () => {
    pending--
    if (pending === 0) process.exit(code)
  }

  process.stdout.write("", finish)
  process.stderr.write("", finish)
}

runRssScraper()
  .then(() => {
    console.log("✅ RSS scraper process exiting after all awaited work completed.")
    exitAfterLogFlush(0)
  })
  .catch((error: unknown) => {
    console.error("❌ RSS scraper failed:", error)
    exitAfterLogFlush(1)
  })
