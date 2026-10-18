/**
 * Last-line quality checks for AI articles before static-site export.
 * Keep structural rules aligned with apps-script/Code.gs.
 */
export type ArticleValidation = { valid: boolean; reason: string }

const MIN_SOURCE_WORDS_FOR_ARTICLE = 25

function wordCount(value: unknown): number {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length
}

function isEpisodeListing(title: string, sourceText: string): boolean {
  const combined = String(title || "") + "\n" + String(sourceText || "")
  const hasEpisodeSignal = /\b(episode|episodes)\b/i.test(combined)
  // Match the Apps Script rules, including shows that omit the word podcast.
  const hasListingSignal = /\b(listen(?:\s+to)?|subscribe|stream|download|show notes|episode notes|suggested reading|more ways to listen|in this episode|in the latest episode|this week's episode|topics? (?:include|covered|discussed)|presented by|transcript|watch the full episode|podcast will be published|listen now)\b/i.test(combined)
  return hasEpisodeSignal && hasListingSignal
}

function articleWordBounds(sourceText: string, title: string) {
  const sourceWords = wordCount(sourceText)
  if (isEpisodeListing(title, sourceText)) return { min: 30, max: 130, minParagraphs: 1 }
  if (sourceWords < MIN_SOURCE_WORDS_FOR_ARTICLE) {
    return { min: Number.POSITIVE_INFINITY, max: 0, minParagraphs: 1 }
  }
  if (sourceWords < 60) {
    return {
      min: Math.max(18, Math.round(sourceWords * 0.45)),
      max: Math.min(100, Math.max(60, Math.round(sourceWords * 1.6))),
      minParagraphs: 1,
    }
  }
  if (sourceWords < 120) return { min: 35, max: 140, minParagraphs: 2 }
  if (sourceWords < 250) return { min: 60, max: 220, minParagraphs: 2 }
  if (sourceWords < 500) return { min: 90, max: 320, minParagraphs: 2 }
  return { min: 120, max: 500, minParagraphs: 2 }
}

function hasUnclosedThinkingBlock(value: string): boolean {
  const lower = String(value || "").toLowerCase()
  return (lower.match(/<think>/g) || []).length >
    (lower.match(/<\/think>/g) || []).length
}

function hasIncompleteArticleEnding(article: string): boolean {
  const value = String(article || "").trim()
  if (!value) return true
  if (/(?:\.{3}|…)\s*["'”’)]*$/.test(value)) return true
  const withoutClosers = value.replace(/["'”’)]{1,}\s*$/, "").trim()
  if (!/[.!?]$/.test(withoutClosers)) return true
  const sentenceBody = withoutClosers.replace(/[.!?]+$/, "").trim()
  const finalToken = sentenceBody.match(/([A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*(?:[-–][A-Za-z0-9]+)*)$/)
  if (!finalToken) return true
  return /^(and|or|but|because|although|though|while|when|if|which|that|who|whom|whose|with|to|of|for|from|by|as|than|including|amid|into|onto|over|under|through|between|among|against|during|without|within|about|before|after|near|despite|versus|in|on|at|up|off|via|around|toward|towards|until|since|upon|across|along|outside|inside|beyond)$/i.test(finalToken[1])
}

function isValidAiOutput(value: string): boolean {
  if (!value || typeof value !== "string") return false
  const v = value.trim()
  if (v.length < 20 || hasUnclosedThinkingBlock(v)) return false
  const lower = v.toLowerCase()
  if (v.startsWith("=") || lower.includes("=ai(")) return false
  if (lower.includes("write a short, clear") ||
      lower.includes("write a clear and well-structured") ||
      lower.includes("summarize the following news")) return false
  if (lower.includes("as an ai language model") ||
      lower.includes("i cannot") || lower.includes("i'm unable")) return false
  if (lower.includes("self-correction") || lower.includes("let me ensure") ||
      lower.includes("check constraints") || lower.includes("draft:") ||
      lower.includes("step 1:") || lower.includes("step 2:") ||
      lower.includes("<think>") || lower.includes("</think>")) return false
  return true
}

function sentenceWords(sentence: string): string[] {
  return String(sentence || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function hasRepetitiveSentences(article: string): boolean {
  const sentences = String(article || "")
    .split(/[.!?]+\s*|\n+/)
    .map(sentence => sentence.trim())
    .filter(sentence => wordCount(sentence) >= 7)
  const normalized = sentences.map(sentence => sentenceWords(sentence).join(" "))

  for (let i = 0; i < normalized.length; i++) {
    const wordsA = sentenceWords(normalized[i])
    const setA = new Set(wordsA)
    for (let j = i + 1; j < normalized.length; j++) {
      const wordsB = sentenceWords(normalized[j])
      if (wordsB.length < 7) continue
      const setB = new Set(wordsB)
      let overlap = 0
      setB.forEach(word => { if (setA.has(word)) overlap++ })
      const union = new Set(wordsA.concat(wordsB)).size
      const similarity = union ? overlap / union : 0
      if (similarity >= 0.82) return true
    }
  }
  return false
}

function paragraphCount(article: string): number {
  return String(article || "").trim().split(/\n\s*\n|\n+/)
    .filter(paragraph => paragraph.trim().length > 0).length
}

function normalizeQuoteComparison(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function hasUnsupportedQuotedText(article: string, sourceText: string, title: string): boolean {
  const output = String(article || "")
  const supported = normalizeQuoteComparison(String(title || "") + " " + String(sourceText || ""))
  const quotePatterns = [
    /“([^”\n]{2,240})”/g,
    /"([^"\n]{2,240})"/g,
    /‘([^’\n]{2,240})’/g,
  ]

  for (const pattern of quotePatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(output)) !== null) {
      const quote = normalizeQuoteComparison(match[1])
      if (quote && !supported.includes(quote)) return true
    }
  }
  return false
}

export function isValidExportHeadline(
  value: string,
  sourceText = "",
  sourceTitle = "",
): boolean {
  if (!value || typeof value !== "string") return false
  const v = value.trim()
  if (v.length < 10 || v.length > 100) return false
  const lower = v.toLowerCase()
  if (v.startsWith("=") || lower.includes("=ai(")) return false
  if (lower.includes("as an ai language model") || lower.includes("i cannot") ||
      lower.includes("i'm unable") || lower.includes("<think>") || lower.includes("</think>")) return false
  if (/[.…]\s*$/.test(v)) return false
  if (/^(headline|summary)\s*[:\-]/i.test(v)) return false
  if (hasUnsupportedQuotedText(v, sourceText, sourceTitle)) return false
  if (/^(and|or|but|because|although|though|while|when|if|which|that|who|whom|whose|with|to|of|for|from|by|as|than|including|amid|into|onto|over|under|through|between|among|against|during|without|within|about|before|after|near|despite|versus|in|on|at|up|off|via|around|toward|towards|until|since|upon|across|along|outside|inside|beyond)$/i.test(v.replace(/[.!?]+$/, "").split(/\s+/).pop() || "")) return false
  return true
}

/**
 * Structural checks do not prove that every generated claim is factual.
 * They prevent known malformed/overlong outputs from being chosen at export.
 */
export function validateExportArticle(
  article: string,
  sourceText: string,
  title: string,
): ArticleValidation {
  if (!isValidAiOutput(article)) return { valid: false, reason: "INVALID_AI_OUTPUT" }
  if (hasIncompleteArticleEnding(article)) return { valid: false, reason: "INCOMPLETE_OR_DANGLING_ENDING" }
  if (hasUnsupportedQuotedText(article, sourceText, title)) return { valid: false, reason: "UNSUPPORTED_QUOTED_TEXT" }
  if (wordCount(sourceText) < MIN_SOURCE_WORDS_FOR_ARTICLE) {
    return { valid: false, reason: "INSUFFICIENT_SOURCE" }
  }
  const bounds = articleWordBounds(sourceText, title)
  const words = wordCount(article)
  if (words < bounds.min) return { valid: false, reason: "TOO_SHORT:" + words + "<" + bounds.min }
  if (words > bounds.max) return { valid: false, reason: "TOO_LONG:" + words + ">" + bounds.max }
  if (hasRepetitiveSentences(article)) return { valid: false, reason: "REPETITIVE_SENTENCES" }
  if (wordCount(sourceText) >= 80 && paragraphCount(article) < bounds.minParagraphs) {
    return { valid: false, reason: "INSUFFICIENT_PARAGRAPH_STRUCTURE" }
  }
  return { valid: true, reason: "OK" }
}

export function validateExportSummary(
  summary: string,
  sourceText: string,
  title: string,
): ArticleValidation {
  if (!isValidAiOutput(summary)) return { valid: false, reason: "INVALID_AI_OUTPUT" }
  if (hasIncompleteArticleEnding(summary)) return { valid: false, reason: "INCOMPLETE_OR_DANGLING_ENDING" }
  if (hasUnsupportedQuotedText(summary, sourceText, title)) {
    return { valid: false, reason: "UNSUPPORTED_QUOTED_TEXT" }
  }
  if (wordCount(sourceText) < MIN_SOURCE_WORDS_FOR_ARTICLE) {
    return { valid: false, reason: "INSUFFICIENT_SOURCE" }
  }
  const words = wordCount(summary)
  if (words < 10) return { valid: false, reason: "SUMMARY_TOO_SHORT" }
  if (words > 55) return { valid: false, reason: "SUMMARY_TOO_LONG" }
  const sentences = String(summary).split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  if (sentences.length < 1 || sentences.length > 3) {
    return { valid: false, reason: "SUMMARY_SENTENCE_COUNT" }
  }
  return { valid: true, reason: "OK" }
}

type SluggedPost = { id: string; title: string; slug: string }

/** Assign a stable, distinct, length-bounded slug to each post in list order. */
export function ensureUniquePostSlugs<T extends SluggedPost>(posts: T[], maxLength = 80): T[] {
  const used = new Set<string>()

  posts.forEach((post, index) => {
    const slugFromTitle = String(post.title || "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const slugFromId = String(post.id || "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const initial = String(post.slug || "").trim() ||
      slugFromTitle || ("article-" + (slugFromId || String(index + 1)))
    const base = initial.slice(0, maxLength).replace(/-+$/, "") ||
      ("article-" + String(index + 1))

    let candidate = base
    let suffix = 1
    while (used.has(candidate)) {
      const tail = "-" + String(suffix++)
      candidate = base.slice(0, Math.max(1, maxLength - tail.length))
        .replace(/-+$/, "") + tail
    }
    post.slug = candidate
    used.add(candidate)
  })

  return posts
}
