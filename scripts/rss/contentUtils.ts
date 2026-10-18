/**
 * RSS content normalization and selection helpers.
 *
 * These helpers deliberately work only with content supplied by the feed.
 * They do not invent missing facts or fetch/paywall-protected article pages.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
}

const TRACKING_PARAM = /^(?:utm_.+|at_medium|at_campaign|ocid|cmpid|traffic_source)$/i

export function countWords(value: string): number {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length
}

export function decodeHtmlEntities(value: string): string {
  return String(value || "").replace(
    /&(#x[\da-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (entity, token: string) => {
      if (token[0] === "#") {
        const isHex = token[1]?.toLowerCase() === "x"
        const codePoint = Number.parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        if (Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
          try {
            return String.fromCodePoint(codePoint)
          } catch {
            return entity
          }
        }
        return entity
      }

      return NAMED_ENTITIES[token.toLowerCase()] ?? entity
    }
  )
}

export function cleanContent(raw: unknown): string {
  const html = String(raw || "")
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    // Preserve block boundaries before removing markup so words and paragraphs
    // from adjacent HTML blocks do not get concatenated.
    .replace(/<\s*br\b[^>]*\/?>/gi, "\n")
    .replace(/<\s*hr\b[^>]*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|ul|ol|h[1-6]|blockquote|tr|table|figure|figcaption)\s*>/gi, "\n")
    .replace(/<(?:p|div|section|article|li|ul|ol|h[1-6]|blockquote|tr|table|figure|figcaption)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")

  const decoded = decodeHtmlEntities(html)
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim()

  const lines = decoded
    .split(/\n+/)
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .filter(line => !/^(?:continue reading|read more|read the full story(?: at .*)?)[.…\s]*$/i.test(line))

  let cleaned = lines.join("\n\n").trim()

  // Remove common feed call-to-action suffixes when appended to an excerpt.
  cleaned = cleaned
    .replace(/\s*(?:Continue reading|Read more)(?:\s*[.…]{1,3})?\s*$/i, "")
    .replace(/\s*Read the full story(?: at [^.\n]{1,160})?(?:[.…]{1,3})?\s*$/i, "")
    .trim()

  return cleaned
}

export function isMetadataOnlyContent(value: string): boolean {
  const text = String(value || "")
  const hasArticleUrl = /\bArticle URL\s*:\s*https?:\/\//i.test(text)
  const hasCommentsUrl = /\bComments URL\s*:\s*https?:\/\//i.test(text)
  const hasEngagementMetadata = /\bPoints\s*:\s*\d+|#\s*Comments\s*:\s*\d+/i.test(text)

  if (!hasArticleUrl || !hasCommentsUrl || !hasEngagementMetadata) return false

  const remainder = text
    .replace(/\bArticle URL\s*:\s*\S+/gi, " ")
    .replace(/\bComments URL\s*:\s*\S+/gi, " ")
    .replace(/\bPoints\s*:\s*\d+/gi, " ")
    .replace(/#\s*Comments\s*:\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return countWords(remainder) < 15
}

export interface SelectedFeedContent {
  content: string
  field: string
  metadataOnly: boolean
}

export function selectFeedContent(item: unknown): SelectedFeedContent {
  const record = item && typeof item === "object"
    ? item as Record<string, unknown>
    : {}

  const fields: Array<[string, unknown]> = [
    ["content", record.content],
    ["content:encoded", record["content:encoded"]],
    ["contentSnippet", record.contentSnippet],
    ["summary", record.summary],
    ["description", record.description],
  ]

  const candidates = fields
    .map(([field, value], priority) => ({
      field,
      priority,
      content: cleanContent(value),
    }))
    .filter(candidate => candidate.content.length > 0)

  const usable = candidates.filter(candidate => !isMetadataOnlyContent(candidate.content))

  if (usable.length === 0) {
    return {
      content: "",
      field: candidates.length > 0 ? "metadata-only" : "none",
      metadataOnly: candidates.length > 0,
    }
  }

  usable.sort((a, b) => {
    // Prefer informative, longer source text, while using field order as a
    // stable tie-breaker. The text is capped at the feed level, not here.
    const aScore = countWords(a.content) * 10 + Math.min(a.content.length, 5000) / 100
    const bScore = countWords(b.content) * 10 + Math.min(b.content.length, 5000) / 100
    return bScore - aScore || a.priority - b.priority
  })

  return {
    content: usable[0].content,
    field: usable[0].field,
    metadataOnly: false,
  }
}

/**
 * Use a normalized URL only for duplicate detection. The original URL remains
 * available to store/display so legitimate article URLs are not rewritten.
 */
export function normalizeUrlForDedup(value: unknown): string {
  const text = String(value || "").trim()
  if (!text) return ""

  try {
    const url = new URL(text)
    if (url.protocol !== "http:" && url.protocol !== "https:") return text

    url.hash = ""
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
    }

    return url.toString()
  } catch {
    return text
  }
}
