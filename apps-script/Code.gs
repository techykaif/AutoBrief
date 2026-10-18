/***********************
 * CONFIG
 ***********************/
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const RETRY_DELAY_MS = 2000
const SCRIPT_VERSION = "2026.10.19.1"
const BATCH_LIMIT = 20
const SLEEP_BETWEEN_MS = 2000
const PROCESS_LOCK_WAIT_MS = 5000
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
    .replace(/&#x([0-9a-f]+);/gi, function (match, hex) {
      const code = parseInt(hex, 16)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    })
    .replace(/&#(\d+);/g, function (match, decimal) {
      const code = parseInt(decimal, 10)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    })
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&rsquo;/gi, "’")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&rdquo;/gi, "”")
    .replace(/&ldquo;/gi, "“")
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
  if (!cleaned) return ""
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  // Never truncate a sentence and add an ellipsis that can masquerade as a complete summary.
  return sentences.length >= 2 ? sentences.slice(0, 2).join(" ") : cleaned
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

function hasUnclosedThinkingBlock(text) {
  const lower = String(text || "").toLowerCase()
  return (lower.match(/<think>/g) || []).length >
    (lower.match(/<\/think>/g) || []).length
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
          if (typeof raw !== "string" || !raw.trim()) {
            Logger.log("⚠️ Empty model response from " + model + "; trying next model")
            break
          }
          if (hasUnclosedThinkingBlock(raw)) {
            Logger.log("⚠️ Incomplete reasoning block from " + model + "; trying next model")
            break
          }
          const result = stripThinkingBlocks(raw)
          if (typeof result !== "string" || !result.trim()) {
            Logger.log("⚠️ Empty cleaned response from " + model + "; trying next model")
            break
          }

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
  const hasEpisodeSignal = /\b(episode|episodes)\b/i.test(combined)
  // Strong listing markers are enough even when the feed never says the word podcast.
  // This catches episode pages such as Radical Thinking that provide show notes and links.
  const hasListingSignal = /\b(listen(?:\s+to)?|subscribe|stream|download|show notes|episode notes|suggested reading|more ways to listen|in this episode|in the latest episode|this week's episode|topics? (?:include|covered|discussed)|presented by|transcript|watch the full episode|podcast will be published|listen now)\b/i.test(combined)
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
    "Do not attribute a motive, rationale, conclusion, quote, stance, or detailed action to a person unless the source explicitly states it. " +
    "Any quotation marks must enclose wording found verbatim in the title or source; never manufacture quotes. " +
    "A title is not evidence for additional supporting facts beyond its literal wording. " +
    "Cover the central event and only the important supporting details that the source actually supplies. " +
    articleLengthGuidance(content, title) + " " +
    "Use separate paragraphs with a clear progression when the source supports it. Do not invent, infer, add outside context, repeat the same fact in different words, add generic filler, or stretch the article to meet a length target. " +
    "Never end with an ellipsis or dangling conjunction/preposition; finish the final sentence completely. " +
    "Do not use bullet points or mention the AI, prompt, RSS feed, or writing process. Keep the tone factual, neutral, and professional.\n\n" +
    GROUNDING_RULES,
    "TITLE: " + title + "\n\nCONTENT: " + content,
    GROQ_MODELS,
    function (candidate) {
      const validation = validateArticleOutput(candidate, content, title)
      if (!validation.valid) Logger.log("⚠️ Article output rejected: " + validation.reason)
      return validation.valid
    }
  )
}


/***********************
 * VALIDATE AI OUTPUT
 ***********************/
function isValidAiOutput(value) {
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


function isValidHeadline(value, sourceText, title) {
  if (!isValidAiOutput(value)) return false
  const v = value.trim()
  if (v.length < 10 || v.length > 100) return false
  if (/[.…]\s*$/.test(v) || hasUnbalancedDoubleQuotes(v)) return false
  if (/^headline\s*[:\-]/i.test(v) || /^summary\s*[:\-]/i.test(v)) return false
  if (hasUnsupportedQuotedText(v, sourceText || "", title || "")) return false

  const finalToken = v.replace(/[.!?]+$/, "").split(/\s+/).pop() || ""
  if (/^(and|or|but|because|although|though|while|when|if|which|that|who|whom|whose|with|to|of|for|from|by|as|than|including|amid|into|onto|over|under|through|between|among|against|during|without|within|about|before|after|near|despite|versus|in|on|at|up|off|via|around|toward|towards|until|since|upon|across|along|outside|inside|beyond)$/i.test(finalToken)) return false
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

function hasUnbalancedDoubleQuotes(value) {
  const text = String(value || "")
  const straight = (text.match(/(?<!\\)"/g) || []).length
  const curlyOpen = (text.match(/“/g) || []).length
  const curlyClose = (text.match(/”/g) || []).length
  return straight % 2 !== 0 || curlyOpen !== curlyClose
}


function hasIncompleteArticleEnding(article) {
  const value = String(article || "").trim()
  if (!value || hasUnbalancedDoubleQuotes(value)) return true
  if (/(?:\.{3}|…)\s*["'”’)]*$/.test(value)) return true

  // Quoted/bracketed endings are allowed only when the underlying sentence
  // has terminal punctuation. Digits and acronyms are valid terminal tokens.
  const withoutClosers = value.replace(/["'”’)]{1,}\s*$/, "").trim()
  if (!/[.!?]$/.test(withoutClosers)) return true
  const sentenceBody = withoutClosers.replace(/[.!?]+$/, "").trim()
  const finalToken = sentenceBody.match(/([A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*(?:[-–][A-Za-z0-9]+)*)$/)
  if (!finalToken) return true

  return /^(and|or|but|because|although|though|while|when|if|which|that|who|whom|whose|with|to|of|for|from|by|as|than|including|amid|into|onto|over|under|through|between|among|against|during|without|within|about|before|after|near|despite|versus|in|on|at|up|off|via|around|toward|towards|until|since|upon|across|along|outside|inside|beyond)$/i.test(finalToken[1])
}


function normalizeQuoteComparison(value) {
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

function hasUnsupportedQuotedText(article, sourceText, title) {
  const output = String(article || "")
  const supported = normalizeQuoteComparison(String(title || "") + " " + String(sourceText || ""))
  const quotePatterns = [
    /“([^”\n]{2,240})”/g,
    /"([^"\n]{2,240})"/g,
    /‘([^’\n]{2,240})’/g
  ]

  for (let p = 0; p < quotePatterns.length; p++) {
    let match
    while ((match = quotePatterns[p].exec(output)) !== null) {
      const quote = normalizeQuoteComparison(match[1])
      if (quote && !supported.includes(quote)) return true
    }
  }
  return false
}


function validateArticleOutput(article, sourceText, title) {
  if (!isValidAiOutput(article)) return { valid: false, reason: "INVALID_AI_OUTPUT" }
  if (hasIncompleteArticleEnding(article)) return { valid: false, reason: "INCOMPLETE_OR_DANGLING_ENDING" }
  if (hasUnsupportedQuotedText(article, sourceText, title)) return { valid: false, reason: "UNSUPPORTED_QUOTED_TEXT" }
  if (!isSufficientSourceText(sourceText)) return { valid: false, reason: "INSUFFICIENT_SOURCE" }
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

function isValidArticleOutput(article, sourceText, title) {
  return validateArticleOutput(article, sourceText, title).valid
}


function isValidSummary(value, sourceText, title) {
  if (!isValidAiOutput(value)) return false
  if (hasIncompleteArticleEnding(value)) return false
  if (hasUnsupportedQuotedText(value, sourceText || "", title || "")) return false

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
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isSimilarTitle(titleA, titleB) {
  const a = normalizeTitleForDedup(titleA)
  const b = normalizeTitleForDedup(titleB)
  if (!a || !b) return false
  if (a === b) return true

  const shorterLength = Math.min(a.length, b.length)
  if (shorterLength >= 25 && (a.includes(b) || b.includes(a))) return true

  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on",
    "for", "at", "by", "as", "is", "are", "was", "were", "with",
    "from", "after", "before", "amid", "into", "over", "about"
  ])
  const wordsA = new Set(a.split(" ").filter(w => w.length > 2 && !stopWords.has(w)))
  const wordsB = new Set(b.split(" ").filter(w => w.length > 2 && !stopWords.has(w)))
  if (!wordsA.size || !wordsB.size) return false

  let overlap = 0
  wordsB.forEach(w => { if (wordsA.has(w)) overlap++ })
  const smaller = Math.min(wordsA.size, wordsB.size)
  const union = new Set([...wordsA, ...wordsB]).size
  return (overlap >= 3 && overlap / smaller >= 0.85) || (union > 0 && overlap / union >= 0.8)
}


/***********************
 * RAW → FINAL PROCESSOR
 ***********************/
function processRawNewsToFinalBlogs() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(PROCESS_LOCK_WAIT_MS)) {
    Logger.log("⏭️ Another processor run is active; this run will exit without changes.")
    return 0
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const rawSheet = ss.getSheetByName("RAW_NEWS")
    const finalSheet = ss.getSheetByName("FINAL_BLOGS")
    if (!rawSheet || !finalSheet) throw new Error("Required sheet missing: RAW_NEWS or FINAL_BLOGS.")

    const rawLastRow = rawSheet.getLastRow()
    if (rawLastRow < 2) {
      Logger.log("📭 RAW_NEWS has no data rows.")
      return 0
    }
    const header = String(rawSheet.getRange(1, 9).getValue() || "").trim().toLowerCase()
    if (header !== "published_at") {
      throw new Error('RAW_NEWS!I1 must be "published_at"; refusing to process rows with an unknown schema.')
    }

    const rawData = rawSheet.getRange(1, 1, rawLastRow, 9).getValues()
    const finalLastRow = finalSheet.getLastRow()
    const existingIds = new Set()
    const existingTitles = []
    if (finalLastRow > 1) {
      finalSheet.getRange(2, 1, finalLastRow - 1, 3).getValues().forEach(row => {
        const id = String(row[1] || "").trim()
        const title = String(row[2] || "").trim()
        if (id) existingIds.add(id)
        if (title) existingTitles.push(title)
      })
    }

    // Include original source titles for already-processed rows too; AI headlines
    // may differ from their input headlines, and both should participate in dedupe.
    for (let i = 1; i < rawData.length; i++) {
      if (String(rawData[i][7] || "").trim().toUpperCase() === "PROCESSED") {
        const sourceTitle = String(rawData[i][2] || "").trim()
        if (sourceTitle) existingTitles.push(sourceTitle)
      }
    }

    const IDX = { id: 0, source: 1, title: 2, url: 3, content: 4,
      category: 5, scraped_at: 6, status: 7, published_at: 8 }
    let published = 0
    let skipped = 0
    let duplicates = 0
    let alreadyPublished = 0
    let freshnessHeld = 0
    let invalidRows = 0
    let batchCount = 0
    const now = new Date()

    for (let i = 1; i < rawData.length; i++) {
      if (batchCount >= BATCH_LIMIT) {
        Logger.log("⏸️ Batch limit reached — next run picks up the rest")
        break
      }
      const row = rawData[i]
      if (String(row[IDX.status] || "").trim().toUpperCase() !== "NEW") continue

      const rawId = String(row[IDX.id] || "").trim()
      const title = String(row[IDX.title] || "").trim()
      const rawContent = String(row[IDX.content] || "").trim()

      // Malformed NEW rows must leave the queue with a visible hold status.
      if (!rawId || !title || !rawContent) {
        rawSheet.getRange(i + 1, IDX.status + 1).setValue("MISSING_REQUIRED_FIELDS")
        invalidRows++
        batchCount++
        Logger.log("⏭️ Held MISSING_REQUIRED_FIELDS at RAW_NEWS row " + (i + 1))
        continue
      }
      if (existingIds.has(rawId)) {
        rawSheet.getRange(i + 1, IDX.status + 1).setValue("PROCESSED")
        alreadyPublished++
        batchCount++
        continue
      }
      if (existingTitles.some(t => isSimilarTitle(title, t))) {
        rawSheet.getRange(i + 1, IDX.status + 1).setValue("DUPLICATE")
        duplicates++
        batchCount++
        Logger.log("⚠️ Duplicate: " + title)
        continue
      }

      const freshness = getSourceFreshnessStatus(row[IDX.published_at], now)
      if (freshness) {
        rawSheet.getRange(i + 1, IDX.status + 1).setValue(freshness)
        freshnessHeld++
        batchCount++
        Logger.log("⏭️ Held " + freshness + " (" + String(row[IDX.scraped_at] || rawId) + "): " + title)
        continue
      }

      const cleaned = cleanText(rawContent)
      if (!isSufficientSourceText(cleaned)) {
        rawSheet.getRange(i + 1, IDX.status + 1).setValue("INSUFFICIENT_SOURCE")
        skipped++
        batchCount++
        Logger.log("⏭️ Held for insufficient source text (" + wordCount(cleaned) + " words): " + title)
        continue
      }

      Logger.log("🤖 [" + (batchCount + 1) + "/" + BATCH_LIMIT + "] " + title)
      const fallbackSummary = generateBaseSummary(cleaned)
      const aiFields = generateAiHeadlineAndSummary(title, cleaned)
      const aiArticle = generateAiArticle(title, cleaned)
      const validation = validateArticleOutput(aiArticle, cleaned, title)
      if (!validation.valid) {
        rawSheet.getRange(i + 1, IDX.status + 1).setValue("AI_FAILED")
        skipped++
        batchCount++
        Logger.log("❌ Article failed (" + validation.reason + "): " + title)
        continue
      }

      const finalTitle = isValidHeadline(aiFields.headline, cleaned, title)
        ? aiFields.headline
        : title
      const finalSummary = isValidSummary(aiFields.summary, cleaned, title)
        ? aiFields.summary
        : (isValidSummary(fallbackSummary, cleaned)
          ? fallbackSummary
          : (/[.!?]$/.test(title) ? title : title + "."))
      const finalContent = aiArticle
      Logger.log("📊 Source: " + wordCount(cleaned) + " words | Article: " +
        wordCount(finalContent) + " words | Headline: " + finalTitle.length +
        " chars | Summary: " + finalSummary.length + " chars")

      const publishedAt = new Date()
      finalSheet.appendRow([
        "BLOG-" + rawId, rawId, finalTitle, slugify(finalTitle), cleaned,
        finalSummary, row[IDX.category], row[IDX.source], publishedAt,
        true, false, finalTitle, finalSummary.slice(0, 160), "LIVE",
        finalSummary, finalContent, finalTitle, publishedAt, cleanSourceUrl(row[IDX.url])
      ])

      existingIds.add(rawId)
      existingTitles.push(finalTitle)
      if (normalizeTitleForDedup(title) !== normalizeTitleForDedup(finalTitle)) {
        existingTitles.push(title)
      }
      rawSheet.getRange(i + 1, IDX.status + 1).setValue("PROCESSED")
      published++
      batchCount++
      Logger.log("✅ " + finalTitle)
      Utilities.sleep(SLEEP_BETWEEN_MS)
    }

    Logger.log("🎉 Published: " + published + " | Already in FINAL_BLOGS: " +
      alreadyPublished + " | Dupes: " + duplicates + " | AI/insufficient failures: " +
      skipped + " | Invalid raw rows: " + invalidRows + " | Held for freshness: " + freshnessHeld)
    return published
  } finally {
    lock.releaseLock()
  }
}


/***********************
 * RESET AI_FAILED → NEW
 ***********************/
function resetAiFailedToNew() {
  const message =
    "Bulk AI_FAILED reset is disabled to protect historical rows. " +
    "Review individual failures and retry only explicitly approved, fresh source IDs."
  Logger.log("⛔ " + message)
  throw new Error(message)
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
 * PIPELINE DIAGNOSTICS
 * Read-only unless dryRunFreshNewArticle makes an AI call.
 ***********************/
function auditPipelineHealth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const rawSheet = ss.getSheetByName("RAW_NEWS")
  const finalSheet = ss.getSheetByName("FINAL_BLOGS")
  if (!rawSheet || !finalSheet) throw new Error("Required sheet missing: RAW_NEWS or FINAL_BLOGS.")

  const rawData = rawSheet.getDataRange().getValues()
  const finalData = finalSheet.getDataRange().getValues()
  const statusCounts = {}
  const recentStatusCounts = {}
  const finalById = new Map()
  const finalIds = new Set()
  const finalTitles = []

  for (let i = 1; i < finalData.length; i++) {
    const row = finalData[i]
    const id = String(row[1] || "").trim()
    const title = String(row[2] || "").trim()
    if (id) {
      finalById.set(id, row)
      finalIds.add(id)
    }
    if (title) finalTitles.push(title)
  }

  const recentStart = Math.max(1, rawData.length - 250)
  const candidateStats = {
    newRows: 0,
    missingFields: 0,
    alreadyInFinalBlogs: 0,
    similarTitle: 0,
    missingDate: 0,
    staleDate: 0,
    futureDate: 0,
    insufficientSource: 0,
    eligible: 0
  }
  const qualityStats = {
    processedRowsChecked: 0,
    missingFinalRows: 0,
    emptyArticles: 0,
    invalidArticles: 0,
    invalidReasons: {},
    incompleteEndings: 0,
    unsupportedQuotes: 0,
    samples: []
  }

  const now = new Date()

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i]
    const status = String(row[7] || "").trim().toUpperCase() || "(BLANK)"
    statusCounts[status] = (statusCounts[status] || 0) + 1
    if (status === "PROCESSED") {
      const sourceTitle = String(row[2] || "").trim()
      if (sourceTitle) finalTitles.push(sourceTitle)
    }
    if (i >= recentStart) {
      recentStatusCounts[status] = (recentStatusCounts[status] || 0) + 1
    }

    if (status === "NEW") {
      candidateStats.newRows++
      const id = String(row[0] || "").trim()
      const title = String(row[2] || "").trim()
      const content = cleanText(String(row[4] || ""))
      if (!id || !title || !content) {
        candidateStats.missingFields++
        continue
      }
      if (finalIds.has(id)) {
        candidateStats.alreadyInFinalBlogs++
        continue
      }
      if (finalTitles.some(existing => isSimilarTitle(title, existing))) {
        candidateStats.similarTitle++
        continue
      }
      const freshness = getSourceFreshnessStatus(row[8], now)
      if (freshness === "MISSING_SOURCE_DATE") {
        candidateStats.missingDate++
        continue
      }
      if (freshness === "STALE_SOURCE") {
        candidateStats.staleDate++
        continue
      }
      if (freshness === "FUTURE_SOURCE_DATE") {
        candidateStats.futureDate++
        continue
      }
      if (freshness) continue
      if (!isSufficientSourceText(content)) {
        candidateStats.insufficientSource++
        continue
      }
      candidateStats.eligible++
    }

    if (i < recentStart || status !== "PROCESSED") continue
    qualityStats.processedRowsChecked++

    const id = String(row[0] || "").trim()
    const finalRow = finalById.get(id)
    if (!finalRow) {
      qualityStats.missingFinalRows++
      continue
    }

    const sourceText = String(finalRow[4] || "")
    const article = String(finalRow[15] || "")
    if (!article.trim()) qualityStats.emptyArticles++

    if (hasIncompleteArticleEnding(article)) qualityStats.incompleteEndings++
    if (hasUnsupportedQuotedText(article, sourceText, String(row[2] || ""))) {
      qualityStats.unsupportedQuotes++
    }

    const validation = validateArticleOutput(article, sourceText, String(row[2] || ""))
    if (!validation.valid) {
      qualityStats.invalidArticles++
      qualityStats.invalidReasons[validation.reason] =
        (qualityStats.invalidReasons[validation.reason] || 0) + 1

      if (qualityStats.samples.length < 12) {
        qualityStats.samples.push({
          id: id,
          title: String(row[2] || "").slice(0, 120),
          reason: validation.reason,
          articleWords: wordCount(article),
          sourceWords: wordCount(sourceText),
          articleEnd: article.trim().slice(-100)
        })
      }
    }
  }

  const output = {
    scriptVersion: SCRIPT_VERSION,
    rawRows: Math.max(0, rawData.length - 1),
    finalRows: Math.max(0, finalData.length - 1),
    statuses: statusCounts,
    last250RawRows: recentStatusCounts,
    newQueueEligibility: candidateStats,
    recentArticleQuality: qualityStats,
    note: "Read-only audit; no Sheet rows, statuses, or published content were changed."
  }

  Logger.log("PIPELINE_HEALTH_AUDIT " + JSON.stringify(output))
  return output
}


/**
 * Makes one AI generation call chain for one eligible NEW row.
 * This function does not change statuses, append to FINAL_BLOGS, or publish.
 */
function dryRunFreshNewArticle() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const rawSheet = ss.getSheetByName("RAW_NEWS")
  const finalSheet = ss.getSheetByName("FINAL_BLOGS")
  if (!rawSheet || !finalSheet) throw new Error("RAW_NEWS or FINAL_BLOGS not found.")

  const rawData = rawSheet.getDataRange().getValues()
  const finalData = finalSheet.getDataRange().getValues()
  const existingIds = new Set()
  const existingTitles = []

  for (let i = 1; i < finalData.length; i++) {
    const id = String(finalData[i][1] || "").trim()
    const title = String(finalData[i][2] || "").trim()
    if (id) existingIds.add(id)
    if (title) existingTitles.push(title)
  }
  for (let i = 1; i < rawData.length; i++) {
    if (String(rawData[i][7] || "").trim().toUpperCase() === "PROCESSED") {
      const sourceTitle = String(rawData[i][2] || "").trim()
      if (sourceTitle) existingTitles.push(sourceTitle)
    }
  }

  let candidate = null
  const now = new Date()

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (String(row[7] || "").trim().toUpperCase() !== "NEW") continue

    const id = String(row[0] || "").trim()
    const title = String(row[2] || "").trim()
    const content = cleanText(String(row[4] || ""))

    if (!id || !title || !content || existingIds.has(id)) continue
    if (existingTitles.some(existing => isSimilarTitle(title, existing))) continue
    if (getSourceFreshnessStatus(row[8], now)) continue
    if (!isSufficientSourceText(content)) continue

    candidate = {
      rowNumber: i + 1,
      id: id,
      title: title,
      content: content,
      sourceWords: wordCount(content),
      publishedAt: String(row[8] || "")
    }
    break
  }

  if (!candidate) {
    Logger.log("DRY_RUN: No eligible candidate found. No AI call was made and no Sheet rows changed.")
    return null
  }

  Logger.log("DRY_RUN_SOURCE " + JSON.stringify({
    row: candidate.rowNumber,
    id: candidate.id,
    title: candidate.title,
    sourceWords: candidate.sourceWords,
    publishedAt: candidate.publishedAt
  }))

  const article = generateAiArticle(candidate.title, candidate.content)
  const validation = validateArticleOutput(article, candidate.content, candidate.title)

  Logger.log("DRY_RUN_RESULT " + JSON.stringify({
    valid: validation.valid,
    reason: validation.reason,
    articleWords: wordCount(article),
    paragraphs: paragraphCount(article),
    incompleteEnding: hasIncompleteArticleEnding(article),
    unsupportedQuotedText: hasUnsupportedQuotedText(article, candidate.content, candidate.title),
    generated: Boolean(article)
  }))
  Logger.log("DRY_RUN_ARTICLE\n" + (article || "[No valid article returned]"))
  Logger.log("DRY_RUN_COMPLETE: No sheet rows changed and nothing published.")
  return validation
}


/***********************
 * MASTER AUTOMATION
 ***********************/
function masterAutomation() {
  Logger.log("🚀 Starting masterAutomation " + SCRIPT_VERSION)

  const processed = processRawNewsToFinalBlogs()

  triggerGithubExport(processed)

  Logger.log("✅ masterAutomation complete.")
}