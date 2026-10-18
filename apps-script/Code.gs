/***********************
 * CONFIG
 ***********************/
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const RETRY_DELAY_MS = 2000
const BATCH_LIMIT = 20
const SLEEP_BETWEEN_MS = 2000
// Hold stories with too little source text instead of padding them into weak articles.
const MIN_SOURCE_WORDS_FOR_ARTICLE = 25
// Historical queue rows must not be revived into current news articles.
const MAX_SOURCE_AGE_DAYS = 7
const FUTURE_SOURCE_SKEW_HOURS = 24

// All models — used for article generation
// Re-verified against console.groq.com/docs/models and /docs/deprecations on 2026-09-24.
// openai/gpt-oss-120b / openai/gpt-oss-20b: production, no deprecation notice.
// qwen/qwen3.8-27b: preview tier (Groq may discontinue preview models at
//   short notice). Direct successor of qwen/qwen3.6-27b; supports
//   reasoning_effort "default" and reasoning_format "hidden" (both used below).
// Removed (shut down for free/developer tiers, now enterprise-only or gone):
//   llama-3.3-70b-versatile and llama-3.1-8b-instant (shut down 08/16/26),
//   qwen/qwen3.6-27b (shut down 09/14/26).
// Removed earlier: qwen/qwen3-32b and meta-llama/llama-4-scout-17b-16e-instruct
//   (shut down 07/17/26), plus invalid IDs that were silently 404ing.
// Not used: minimaxai/minimax-m2.7 (preview, enterprise/contact-sales only),
//   openai/gpt-oss-safeguard-20b (a safety-classifier model, not for writing).
// Rate limits are listed per model, so every extra model in the rotation adds
//   headroom before all calls 429. Groq's model list changes fast — recheck
//   https://api.groq.com/openai/v1/models now and then.
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
]

// Models for structured format calls (headline+summary).
// Qwen used to be excluded because it leaked reasoning into structured
// output. The Qwen calls below set reasoning_format:"hidden", which returns
// only the final answer, so it is now included for more rotation depth.
const STRUCTURED_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
]

const REASONING_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
const QWEN_MODELS = ["qwen/qwen3.8-27b"]

// Shared accuracy rules appended to every AI prompt.
// Why: the models' built-in knowledge is out of date, and RSS content is
// often only a short blurb — without these rules the model fills the gap
// from memory (wrong titles, "former" presidents, invented context).
const GROUNDING_RULES =
  "STRICT ACCURACY RULES: Use ONLY facts stated in the provided title and content. " +
  "Your own background knowledge is out of date, so never add or change anyone's job title, office, party, or status " +
  "(for example, do not call someone a former or current official unless the content says so). " +
  "Copy names and titles exactly as written in the content. " +
  "Do not add background, context, dates, numbers, or quotes that are not in the content. " +
  "If the content is thin, keep the writing short and plain instead of adding information."

function getGroqApiKey() {
  return PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY")
}

function getGithubToken() {
  return PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN")
}

function getGithubRepo() {
  return PropertiesService.getScriptProperties().getProperty("GITHUB_REPO")
}


/***********************
 * TEXT CLEANING
 ***********************/
function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.!?])([A-Za-z])/g, "$1 $2")
    .trim()
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
}

function capitalizeSentences(text) {
  return text.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, c => c.toUpperCase())
}

function cleanText(text) {
  return capitalizeSentences(
    normalizeText(decodeHtmlEntities(text))
  )
}

function generateBaseSummary(text) {
  const cleaned = cleanText(text)
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)

  if (sentences.length >= 2) {
    return sentences.slice(0, 2).join(" ")
  }

  const words = cleaned.split(/\s+/).filter(Boolean)
  return words.length > 35 ? words.slice(0, 35).join(" ") + "…" : cleaned
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)         // ← cap at 80 chars — prevents ENAMETOOLONG on Vercel
    .replace(/-+$/, "")
}

// Strips RSS/tracking params (e.g. BBC's ?at_medium=RSS&at_campaign=rss, utm_*)
// so the "read the original" link on the site is clean.
function cleanSourceUrl(url) {
  if (!url) return ""
  let u = String(url).trim()
  if (!/^https?:\/\//i.test(u)) return ""

  let hash = ""
  const hashIdx = u.indexOf("#")

  if (hashIdx > -1) {
    hash = u.slice(hashIdx)
    u = u.slice(0, hashIdx)
  }

  const qIdx = u.indexOf("?")

  if (qIdx === -1) return u + hash

  const base = u.slice(0, qIdx)

  const kept = u.slice(qIdx + 1).split("&").filter(function (p) {
    return p && !/^(at_medium|at_campaign|utm_[a-z_]+|ocid|cmpid)=/i.test(p)
  })

  return (kept.length ? base + "?" + kept.join("&") : base) + hash
}


/***********************
 * STRIP THINKING BLOCKS
 * Strips <think>...</think> from Qwen models
 * Also strips any lines that look like internal reasoning
 * Kept as a defense-in-depth safety net even though reasoning_format/
 * include_reasoning below should prevent <think> tags from ever arriving.
 ***********************/
function stripThinkingBlocks(text) {
  if (!text) return text

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\n]+/, "")
    .trim()
}


/***********************
 * GROQ AI CALL
 * modelList — which set of models to try
 ***********************/
function callGroq(systemPrompt, userContent, modelList, responseValidator) {
  const apiKey = getGroqApiKey()

  if (!apiKey) {
    Logger.log("❌ GROQ_API_KEY not found")
    return null
  }

  const models = modelList || GROQ_MODELS

  for (let m = 0; m < models.length; m++) {
    const model = models[m]
    const isReasoning = REASONING_MODELS.indexOf(model) !== -1
    const isQwen = QWEN_MODELS.indexOf(model) !== -1

    const payload = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.5,
      max_tokens: 1024
    }

    // GPT-OSS reasoning models: keep the reasoning effort (helps quality)
    // but exclude the reasoning trace from the response entirely, so it
    // can never leak into published content even if a call gets truncated.
    if (isReasoning) {
      payload.reasoning_effort = "medium"
      payload.include_reasoning = false
    }

    // Qwen reasoning models: same idea — reasoning_format "hidden" means
    // Groq only returns the final answer, no <think>...</think> in content,
    // regardless of whether the model's internal reasoning got cut off.
    if (isQwen) {
      payload.reasoning_effort = "default"
      payload.reasoning_format = "hidden"
    }

    const options = {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }

    let retries = 0
    const maxRetries = 2

    while (retries <= maxRetries) {
      try {
        const response = UrlFetchApp.fetch(GROQ_API_URL, options)
        const code = response.getResponseCode()
        const body = JSON.parse(response.getContentText())

        if (code === 200) {
          const raw = body && body.choices && body.choices[0] &&
            body.choices[0].message && body.choices[0].message.content
          const result = stripThinkingBlocks(raw)

          // Article generation can reject a syntactically successful response.
          // Break the retry loop and continue to the next model in the rotation.
          if (typeof responseValidator === "function" && !responseValidator(result)) {
            Logger.log("⚠️ Response failed quality validation on " + model + "; trying next model")
            break
          }

          if (m > 0) {
            Logger.log("✅ Used fallback model: " + model)
          }

          return result
        }

        if (code === 429) {
          Logger.log("⏳ Rate limited on " + model + ", trying next...")
          break
        }

        if (code === 404) {
          Logger.log("⚠️ Deprecated/not found: " + model)
          break
        }

        if (code === 503 || code === 502) {
          retries++

          if (retries <= maxRetries) {
            Utilities.sleep(RETRY_DELAY_MS * retries)
            continue
          }

          break
        }

        Logger.log("❌ " + model + " error " + code)
        break

      } catch (e) {
        retries++
        Logger.log("❌ Fetch error on " + model + ": " + e.message)

        if (retries <= maxRetries) {
          Utilities.sleep(RETRY_DELAY_MS)
        }
      }
    }
  }

  Logger.log("❌ All models exhausted")
  return null
}


/***********************
 * COMBINED HEADLINE + SUMMARY
 * Uses STRUCTURED_MODELS
 * Robust parser extracts last HEADLINE/SUMMARY occurrence
 * so even if model leaks reasoning, we get the final answer
 ***********************/
function generateAiHeadlineAndSummary(title, content) {
  const result = callGroq(
    "You are a professional news editor. Given a news title and content, respond with EXACTLY these two lines and nothing else:\n" +
    "HEADLINE: [one clear search-friendly news headline that keeps the main entity, event, and distinguishing fact; factual, specific, no clickbait, no quotes; under 90 characters when possible]\n" +
    "SUMMARY: [exactly 2 clear factual sentences capturing the most important details]\n\n" +
    GROUNDING_RULES,
    "TITLE: " + title + "\n\nCONTENT: " + content,
    STRUCTURED_MODELS
  )

  if (!result) {
    return { headline: null, summary: null }
  }

  // Robust parser — finds the LAST occurrence of HEADLINE/SUMMARY
  // so if model outputs reasoning before the answer, we still get the right lines
  const lines = result.split("\n")

  let headline = null
  let summary = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (/^HEADLINE:\s*/i.test(line)) {
      headline = line.replace(/^HEADLINE:\s*/i, "").trim()
    }

    if (/^SUMMARY:\s*/i.test(line)) {
      // Summary might span multiple lines — grab current + next line if needed
      let s = line.replace(/^SUMMARY:\s*/i, "").trim()

      if (s.length < 20 && lines[i + 1]) {
        s = s + " " + lines[i + 1].trim()
      }

      summary = s
    }
  }

  return { headline, summary }
}


/***********************
 * ARTICLE GENERATION
 * Uses all models including Qwen (good for long-form)
 * Now receives the title too, so the model has more to stay grounded in.
 ***********************/
function isEpisodeListing(title, sourceText) {
  const combined = String(title || "") + "\n" + String(sourceText || "")
  const hasEpisodeSignal = /\b(podcast|episode|podcast series|listen to the episode)\b/i.test(combined)
  const hasListingSignal = /\b(watch the full episode|more ways to listen|suggested reading|presented by|in the latest episode|podcast will be published)\b/i.test(combined)
  return hasEpisodeSignal && hasListingSignal
}

function articleLengthGuidance(sourceText, title) {
  const sourceWords = wordCount(sourceText)

  if (isEpisodeListing(title, sourceText)) {
    return "This is a podcast/episode listing, not a transcript. Write a concise 50–110 word overview in one or two paragraphs. State only who is featured and which topics the source explicitly says the episode covers. Do not narrate unprovided details of the conversation. Do not say the guest argued, defended, claimed, explained, or justified a particular position unless that argument or position is explicitly stated in the source. A topic being discussed is not evidence of what the guest concluded. Ignore suggested-reading and footer link lists; do not treat them as the main story."
  }
  if (sourceWords < 60) {
    return "Write one or two compact paragraphs, usually about 25–70 words. Include the available facts without repeating them."
  }
  if (sourceWords < 120) {
    return "Write two or three paragraphs, usually about 45–110 words. Retain all distinct, newsworthy details."
  }
  if (sourceWords < 250) {
    return "Write two to four paragraphs, usually about 70–180 words. Cover the main event and each important detail present in the source."
  }
  if (sourceWords < 500) {
    return "Write three to five paragraphs, usually about 100–280 words. Organize the source's important details logically."
  }
  return "Write four to six paragraphs, usually about 150–450 words. Preserve the significant facts and distinctions; do not compress the source into a short blurb."
}

function generateAiArticle(title, content) {
  return callGroq(
    "You are a professional news writer. Write a useful, well-structured article using ONLY facts explicitly stated in the provided title and source content. " +
    "First identify what the source actually reports; do not turn a topic, headline, or implication into an unsupported claim. " +
    "If the source is an announcement, podcast listing, teaser, or topic preview, summarize that announcement only. Never reconstruct an unseen interview, event, article, or argument from the topic label. " +
    "Do not attribute a motive, rationale, conclusion, quote, stance, or detailed action to a person unless the source explicitly states it. A title is not evidence for additional supporting facts beyond its literal wording. " +
    "Cover the central event and only the important supporting details that the source actually supplies. " +
    articleLengthGuidance(content, title) + " " +
    "Use separate paragraphs with a clear progression when the source supports it. Do not invent, infer, add outside context, repeat the same fact in different words, add generic filler, or stretch the article to meet a length target. " +
    "Do not use bullet points or mention the AI, prompt, RSS feed, or writing process. Keep the tone factual, neutral, and professional.\n\n" +
    GROUNDING_RULES,
    "TITLE: " + title + "\n\nCONTENT: " + content,
    GROQ_MODELS,
    function (candidate) {
      return isValidArticleOutput(candidate, content, title)
    }
  )
}


/***********************
 * VALIDATE AI OUTPUT
 ***********************/
function isValidAiOutput(value) {
  if (!value || typeof value !== "string") return false

  const v = value.trim()

  if (v.length < 20) return false

  const lower = v.toLowerCase()

  if (v.startsWith("=")) return false
  if (lower.includes("=ai(")) return false
  if (lower.includes("write a short, clear")) return false
  if (lower.includes("write a clear and well-structured")) return false
  if (lower.includes("summarize the following news")) return false
  if (lower.includes("as an ai language model")) return false
  if (lower.includes("i cannot")) return false
  if (lower.includes("i'm unable")) return false

  // Reject if it looks like leaked reasoning
  if (lower.includes("self-correction")) return false
  if (lower.includes("let me ensure")) return false
  if (lower.includes("check constraints")) return false
  if (lower.includes("draft:")) return false
  if (lower.includes("step 1:") || lower.includes("step 2:")) return false

  return true
}

function isValidHeadline(value) {
  if (!isValidAiOutput(value)) return false

  const v = value.trim()

  // Keep generated headlines usable in search results and UI.
  if (v.length > 100) return false

  // Don't accept parser labels as actual headline content.
  if (/^headline\s*[:\-]/i.test(v)) return false
  if (/^summary\s*[:\-]/i.test(v)) return false

  return true
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length
}

function parseSourceDateValue(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime())
  }

  if (typeof value === "number" && isFinite(value)) {
    // Google Sheets serial dates count days from 1899-12-30.
    const milliseconds = value > 100000000000
      ? value
      : (value - 25569) * 24 * 60 * 60 * 1000
    const numericDate = new Date(milliseconds)
    return isNaN(numericDate.getTime()) ? null : numericDate
  }

  const text = String(value || "").trim()
  if (!text) return null

  const parsed = new Date(text)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Returns an empty string for a fresh item, or a hold status if its actual
 * RSS publication date is missing or outside the freshness window. Do not use
 * scraped_at or the row ID: both describe ingestion, not when the story happened.
 */
function getSourceFreshnessStatus(publishedAt, now) {
  const referenceTime = parseSourceDateValue(now) || new Date()

  const sourceDate = parseSourceDateValue(publishedAt)
  if (!sourceDate) return "MISSING_SOURCE_DATE"

  const ageMs = referenceTime.getTime() - sourceDate.getTime()
  const maximumAgeMs = MAX_SOURCE_AGE_DAYS * 24 * 60 * 60 * 1000
  const maximumFutureMs = FUTURE_SOURCE_SKEW_HOURS * 60 * 60 * 1000

  if (ageMs > maximumAgeMs) return "STALE_SOURCE"
  if (ageMs < -maximumFutureMs) return "FUTURE_SOURCE_DATE"

  return ""
}

function isSufficientSourceText(sourceText) {
  return wordCount(sourceText) >= MIN_SOURCE_WORDS_FOR_ARTICLE
}

function articleWordBounds(sourceText, title) {
  const sourceWords = wordCount(sourceText)

  if (isEpisodeListing(title, sourceText)) {
    return { min: 30, max: 130, minParagraphs: 1 }
  }

  if (sourceWords < MIN_SOURCE_WORDS_FOR_ARTICLE) {
    return { min: Infinity, max: 0, minParagraphs: 1 }
  }
  if (sourceWords < 60) {
    return {
      min: Math.max(18, Math.round(sourceWords * 0.45)),
      max: Math.min(100, Math.max(60, Math.round(sourceWords * 1.6))),
      minParagraphs: 1
    }
  }
  if (sourceWords < 120) return { min: 35, max: 140, minParagraphs: 2 }
  if (sourceWords < 250) return { min: 60, max: 220, minParagraphs: 2 }
  if (sourceWords < 500) return { min: 90, max: 320, minParagraphs: 2 }

  return { min: 120, max: 500, minParagraphs: 2 }
}

function minimumArticleWords(sourceText) {
  return articleWordBounds(sourceText).min
}

function sentenceWords(sentence) {
  return String(sentence || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function hasRepetitiveSentences(article) {
  const sentences = String(article || "")
    .split(/[.!?]+\s*|\n+/)
    .map(function (sentence) {
      return sentence.trim()
    })
    .filter(function (sentence) {
      return wordCount(sentence) >= 7
    })

  const normalized = sentences.map(function (sentence) {
    return sentenceWords(sentence).join(" ")
  })

  for (let i = 0; i < normalized.length; i++) {
    const wordsA = sentenceWords(normalized[i])
    const setA = new Set(wordsA)

    for (let j = i + 1; j < normalized.length; j++) {
      const wordsB = sentenceWords(normalized[j])
      if (wordsB.length < 7) continue

      const setB = new Set(wordsB)
      let overlap = 0
      setB.forEach(function (word) {
        if (setA.has(word)) overlap++
      })

      const union = new Set(wordsA.concat(wordsB)).size
      const similarity = union ? overlap / union : 0

      if (similarity >= 0.82) return true
    }
  }

  return false
}

function paragraphCount(article) {
  return String(article || "")
    .trim()
    .split(/\n\s*\n|\n+/)
    .filter(function (paragraph) {
      return paragraph.trim().length > 0
    })
    .length
}

function hasIncompleteArticleEnding(article) {
  const value = String(article || "").trim()
  if (!value) return true

  // Ellipses at the end usually indicate the model stopped mid-thought.
  if (/(?:\.{3}|…)\s*["'”’)]*$/.test(value)) return true

  // Allow closing quotes/parentheses after sentence punctuation, but require a
  // real terminal mark rather than a comma, colon, or dangling clause.
  const withoutClosers = value.replace(/["'”’)]{1,}\s*$/, "").trim()
  if (!/[.!?]$/.test(withoutClosers)) return true

  const sentenceBody = withoutClosers.replace(/[.!?]+$/, "").trim()
  // A finished sentence may end in a numeral, score, year, acronym, or version
  // (e.g. "COP17", "July 2027", "6-1", or "U.S."). Don't mark these as cut-offs.
  const finalTokenMatch = sentenceBody.match(/([A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*(?:[-–][A-Za-z0-9]+)*)$/)
  if (!finalTokenMatch) return true

  // Catch common model cut-offs even when the model incorrectly adds a period.
  return /^(and|or|but|because|although|though|while|when|if|which|that|who|whom|whose|with|to|of|for|from|by|as|than|including|amid|into|onto|over|under|through|between|among|against|during|without|within|about|before|after|near|despite|versus)$/i
    .test(finalTokenMatch[1])
}


function isValidArticleOutput(article, sourceText, title) {
  if (!isValidAiOutput(article)) return false
  if (hasIncompleteArticleEnding(article)) return false
  if (!isSufficientSourceText(sourceText)) return false

  const bounds = articleWordBounds(sourceText, title)
  const words = wordCount(article)

  if (words < bounds.min || words > bounds.max) return false
  if (hasRepetitiveSentences(article)) return false

  // Longer sources should produce readable paragraph structure, not one blob.
  if (wordCount(sourceText) >= 80 && paragraphCount(article) < bounds.minParagraphs) {
    return false
  }

  return true
}

function isValidSummary(value, sourceText) {
  if (!isValidAiOutput(value)) return false

  const words = wordCount(value)
  if (words < 10 || words > 55) return false

  const sentenceCount = String(value)
    .split(/[.!?]+/)
    .map(function (sentence) { return sentence.trim() })
    .filter(Boolean)
    .length

  return sentenceCount >= 1 && sentenceCount <= 3 &&
    wordCount(sourceText) >= MIN_SOURCE_WORDS_FOR_ARTICLE
}


/***********************
 * DEDUPLICATION
 ***********************/
function normalizeTitleForDedup(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isSimilarTitle(titleA, titleB) {
  const a = normalizeTitleForDedup(titleA)
  const b = normalizeTitleForDedup(titleB)

  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true

  const wordsA = new Set(a.split(" "))
  const wordsB = b.split(" ")
  const overlap = wordsB.filter(w => wordsA.has(w)).length

  return overlap / Math.max(wordsA.size, wordsB.length) >= 0.7
}


/***********************
 * RAW → FINAL PROCESSOR
 ***********************/
function processRawNewsToFinalBlogs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const rawSheet = ss.getSheetByName("RAW_NEWS")
  const finalSheet = ss.getSheetByName("FINAL_BLOGS")

  const rawData = rawSheet.getDataRange().getValues()
  const finalLastRow = finalSheet.getLastRow()

  const existingIds = new Set()
  const existingTitles = []

  if (finalLastRow > 1) {
    const finalData = finalSheet
      .getRange(2, 1, finalLastRow - 1, 3)
      .getValues()

    finalData.forEach(row => {
      existingIds.add(String(row[1]).trim())
      existingTitles.push(String(row[2]).trim())
    })
  }

  const IDX = {
    id: 0,
    source: 1,
    title: 2,
    url: 3,
    content: 4,
    category: 5,
    scraped_at: 6,
    status: 7,
    published_at: 8
  }

  let processed = 0
  let skipped = 0
  let duplicates = 0
  let freshnessHeld = 0
  let batchCount = 0

  for (let i = 1; i < rawData.length; i++) {

    if (batchCount >= BATCH_LIMIT) {
      Logger.log("⏸️ Batch limit reached — next run picks up the rest")
      break
    }

    const row = rawData[i]

    if (String(row[IDX.status]).toUpperCase() !== "NEW") {
      continue
    }

    if (!row[IDX.title] || !row[IDX.content]) {
      continue
    }

    const rawId = String(row[IDX.id]).trim()
    const title = String(row[IDX.title]).trim()

    if (existingIds.has(rawId)) {
      rawSheet
        .getRange(i + 1, IDX.status + 1)
        .setValue("PROCESSED")

      continue
    }

    const isDuplicate = existingTitles.some(t => isSimilarTitle(title, t))

    if (isDuplicate) {
      rawSheet
        .getRange(i + 1, IDX.status + 1)
        .setValue("DUPLICATE")

      duplicates++

      Logger.log("⚠️ Duplicate: " + title)
      continue
    }

    const freshnessStatus = getSourceFreshnessStatus(
      row[IDX.published_at],
      new Date()
    )

    if (freshnessStatus) {
      rawSheet
        .getRange(i + 1, IDX.status + 1)
        .setValue(freshnessStatus)

      freshnessHeld++
      batchCount++

      Logger.log(
        "⏭️ Held " + freshnessStatus + " (" +
        String(row[IDX.scraped_at] || rawId) + "): " + title
      )
      continue
    }

    const cleaned = cleanText(String(row[IDX.content]))

    // Weak snippets cannot support a reliable article. Hold them for later
    // source enrichment instead of paying for generation and publishing padding.
    if (!isSufficientSourceText(cleaned)) {
      rawSheet
        .getRange(i + 1, IDX.status + 1)
        .setValue("INSUFFICIENT_SOURCE")

      Logger.log(
        "⏭️ Held for insufficient source text (" +
        wordCount(cleaned) + " words): " + title
      )

      skipped++
      batchCount++
      continue
    }

    const summary = generateBaseSummary(cleaned)

    Logger.log(
      "🤖 [" +
      (batchCount + 1) +
      "/" +
      BATCH_LIMIT +
      "] " +
      title
    )

    // Call 1: headline + summary
    const {
      headline: aiHeadline,
      summary: aiSummary
    } = generateAiHeadlineAndSummary(title, cleaned)

    // Call 2: article
    const aiArticle = generateAiArticle(title, cleaned)

    const articleIsValid = isValidArticleOutput(
      aiArticle,
      cleaned,
      title
    )

    if (!articleIsValid) {
      rawSheet
        .getRange(i + 1, IDX.status + 1)
        .setValue("AI_FAILED")

      Logger.log("❌ Article failed: " + title)

      skipped++
      batchCount++

      continue
    }

    const finalTitle = isValidHeadline(aiHeadline)
      ? aiHeadline
      : title

    const finalSummary = isValidSummary(aiSummary, cleaned)
      ? aiSummary
      : summary

    const finalContent = aiArticle

    Logger.log(
      "📊 Source: " +
      wordCount(cleaned) +
      " words | Article: " +
      wordCount(finalContent) +
      " words | Headline: " +
      finalTitle.length +
      " chars | Summary: " +
      finalSummary.length +
      " chars"
    )

    const now = new Date()

    finalSheet.appendRow([
      "BLOG-" + rawId,
      rawId,
      finalTitle,
      slugify(finalTitle),
      cleaned,
      finalSummary,
      row[IDX.category],
      row[IDX.source],
      now,
      true,
      false,
      finalTitle,
      finalSummary.slice(0, 160),
      "LIVE",
      finalSummary,
      finalContent,
      finalTitle,
      now,
      cleanSourceUrl(row[IDX.url])
    ])

    existingIds.add(rawId)
    existingTitles.push(title)

    rawSheet
      .getRange(i + 1, IDX.status + 1)
      .setValue("PROCESSED")

    processed++
    batchCount++

    Logger.log("✅ " + finalTitle)

    Utilities.sleep(SLEEP_BETWEEN_MS)
  }

  Logger.log(
    "🎉 Published: " +
    processed +
    " | Dupes: " +
    duplicates +
    " | Failed/insufficient: " +
    skipped +
    " | Held for freshness: " +
    freshnessHeld
  )

  return processed
}


/***********************
 * RESET AI_FAILED → NEW
 ***********************/
function resetAiFailedToNew() {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName("RAW_NEWS")

  const data = sheet.getDataRange().getValues()
  let reset = 0

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]).toUpperCase() === "AI_FAILED") {
      sheet
        .getRange(i + 1, 8)
        .setValue("NEW")

      reset++
    }
  }

  Logger.log("✅ Reset " + reset + " rows to NEW")

  SpreadsheetApp
    .getUi()
    .alert("✅ Reset " + reset + " rows back to NEW")
}


/***********************
 * ONE-OFF: BACKFILL source_url FOR EXISTING FINAL_BLOGS ROWS
 * Run manually once, after adding the "source_url" header in S1.
 * Matches FINAL_BLOGS col B (raw id) to RAW_NEWS col A (id).
 * Rows whose RAW_NEWS entry no longer exists stay blank.
 ***********************/
function backfillSourceUrls() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  const raw = ss
    .getSheetByName("RAW_NEWS")
    .getDataRange()
    .getValues()

  const finalSheet = ss.getSheetByName("FINAL_BLOGS")
  const lastRow = finalSheet.getLastRow()

  if (lastRow < 2) return

  const urlById = {}

  for (let i = 1; i < raw.length; i++) {
    urlById[String(raw[i][0]).trim()] =
      cleanSourceUrl(raw[i][3])
  }

  const ids = finalSheet
    .getRange(2, 2, lastRow - 1, 1)
    .getValues()

  const current = finalSheet
    .getRange(2, 19, lastRow - 1, 1)
    .getValues()

  let filled = 0

  const out = ids.map(function (r, i) {
    if (current[i][0]) {
      return [current[i][0]]
    }

    const u = urlById[String(r[0]).trim()]

    if (u) {
      filled++
      return [u]
    }

    return [""]
  })

  finalSheet
    .getRange(2, 19, lastRow - 1, 1)
    .setValues(out)

  Logger.log("✅ Backfilled " + filled + " source URLs")
}


/***********************
 * TRIGGER GITHUB EXPORT
 ***********************/
function triggerGithubExport(articlesProcessed) {
  const token = getGithubToken()
  const repo = getGithubRepo()

  if (!token || !repo) {
    Logger.log("⚠️ GITHUB_TOKEN or GITHUB_REPO not set")
    return
  }

  if (articlesProcessed === 0) {
    Logger.log("⏭️ No new articles — skipping export")
    return
  }

  const url =
    "https://api.github.com/repos/" +
    repo +
    "/actions/workflows/export-posts.yml/dispatches"

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    payload: JSON.stringify({
      ref: "main",
      inputs: {
        articles_count: String(articlesProcessed)
      }
    }),
    muteHttpExceptions: true
  }

  try {
    const response = UrlFetchApp.fetch(url, options)
    const code = response.getResponseCode()

    if (code === 204) {
      Logger.log("🚀 GitHub export triggered!")
    } else {
      Logger.log(
        "❌ GitHub trigger failed: " +
        code +
        " — " +
        response.getContentText()
      )
    }

  } catch (e) {
    Logger.log("❌ GitHub trigger error: " + e.message)
  }
}


/***********************
 * MASTER AUTOMATION
 ***********************/
function masterAutomation() {
  Logger.log("🚀 Starting masterAutomation...")

  const processed = processRawNewsToFinalBlogs()

  triggerGithubExport(processed)

  Logger.log("✅ masterAutomation complete.")
}