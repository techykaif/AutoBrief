/* /api/track/route.ts */
// Increments total visit count in Google Sheets ANALYTICS tab

import { NextRequest, NextResponse } from "next/server"
import { JWT } from "google-auth-library"

export const runtime = "nodejs"

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const ANALYTICS_RANGE = "ANALYTICS!B2"
const TRACK_COOKIE = "ab_track"
const TRACK_WINDOW_SECONDS = 5 * 60
const MAX_INCREMENT_RETRIES = 5

let analyticsSheetId: number | null = null

async function getAccessToken(): Promise<string> {
  const client = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const credentials = await client.authorize()
  if (!credentials.access_token) throw new Error("No token")
  return credentials.access_token
}

async function getAnalyticsSheetId(token: string): Promise<number> {
  if (analyticsSheetId !== null) return analyticsSheetId

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`
  )
  url.searchParams.set("ranges", ANALYTICS_RANGE)
  url.searchParams.set("fields", "sheets(properties(sheetId,title))")

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())

  const data = await res.json()
  const sheet = data.sheets?.find(
    (item: { properties?: { title?: string } }) =>
      item.properties?.title === "ANALYTICS"
  )
  const sheetId = sheet?.properties?.sheetId

  if (typeof sheetId !== "number") {
    throw new Error("ANALYTICS sheet not found")
  }

  analyticsSheetId = sheetId
  return sheetId
}

async function fetchCell(range: string, token: string): Promise<number> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const val = data.values?.[0]?.[0]
  return val ? parseInt(val, 10) : 0
}

async function updateCell(range: string, value: number, token: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [[value]] }),
    }
  )
  if (!res.ok) throw new Error(await res.text())
}

async function incrementVisitCount(token: string): Promise<number> {
  const sheetId = await getAnalyticsSheetId(token)

  for (let attempt = 0; attempt < MAX_INCREMENT_RETRIES; attempt += 1) {
    const current = await fetchCell(ANALYTICS_RANGE, token)
    const newCount = (Number.isFinite(current) ? current : 0) + 1

    // Use an atomic FindReplaceRequest as a compare-and-swap operation. If
    // another request changed B2 after we read it, this request changes zero
    // cells and retries with the latest value instead of losing an increment.
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              findReplace: {
                find: String(current),
                replacement: String(newCount),
                matchCase: true,
                matchEntireCell: true,
                searchByRegex: false,
                includeFormulas: false,
                range: {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: 2,
                  startColumnIndex: 1,
                  endColumnIndex: 2,
                },
              },
            },
          ],
        }),
      }
    )

    if (!res.ok) throw new Error(await res.text())

    const data = await res.json()
    const changed = data.replies?.[0]?.findReplace?.occurrencesChanged ?? 0

    if (changed === 1) return newCount
  }

  throw new Error("Visit counter was busy; retry limit reached")
}

export async function POST(request: NextRequest) {
  // The browser already limits tracking to one request per five minutes.
  // Enforce the same cooldown server-side so callers cannot simply bypass
  // localStorage and inflate the production counter with repeated requests.
  if (request.cookies.get(TRACK_COOKIE)) {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    })
  }

  try {
    const token = await getAccessToken()
    const newCount = await incrementVisitCount(token)

    const response = NextResponse.json(
      { visits: newCount },
      { headers: { "Cache-Control": "no-store" } }
    )

    response.cookies.set({
      name: TRACK_COOKIE,
      value: "1",
      maxAge: TRACK_WINDOW_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Track error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
