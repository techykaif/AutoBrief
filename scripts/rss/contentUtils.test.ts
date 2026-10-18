import assert from "node:assert/strict"
import test from "node:test"
import {
  cleanContent,
  countWords,
  isMetadataOnlyContent,
  normalizeUrlForDedup,
  selectFeedContent,
} from "./contentUtils"

test("cleanContent preserves paragraph boundaries and decodes common HTML entities", () => {
  const actual = cleanContent(
    "<p>First &amp; important.</p><p>It&#8217;s the second paragraph.</p><script>tracking()</script>"
  )

  assert.equal(actual, "First & important.\n\nIt’s the second paragraph.")
})

test("cleanContent removes trailing feed call-to-action text", () => {
  assert.equal(
    cleanContent("<p>The report outlines three findings.</p> Continue reading..."),
    "The report outlines three findings."
  )
})

test("selectFeedContent chooses the most informative non-metadata field", () => {
  const selected = selectFeedContent({
    content: "Article URL: https://example.com/story Comments URL: https://news.ycombinator.com/item?id=1 Points: 12 # Comments: 4",
    contentSnippet: "A brief but substantive report contains several details about the announcement and its impact.",
    summary: "A short teaser.",
  })

  assert.equal(selected.field, "contentSnippet")
  assert.equal(selected.metadataOnly, false)
  assert.match(selected.content, /substantive report/)
})

test("metadata-only Hacker News feed content is detected", () => {
  const metadata = "Article URL: https://example.com/story Comments URL: https://news.ycombinator.com/item?id=1 Points: 226 # Comments: 89"

  assert.equal(isMetadataOnlyContent(metadata), true)
  assert.deepEqual(selectFeedContent({ content: metadata }), {
    content: "",
    field: "metadata-only",
    metadataOnly: true,
  })
})

test("genuine content is not mislabeled as metadata-only", () => {
  const text = "Researchers released a new study and reported several results for public review."

  assert.equal(isMetadataOnlyContent(text), false)
  assert.ok(countWords(text) > 5)
})

test("duplicate URL normalization removes tracking parameters but preserves story identifiers", () => {
  assert.equal(
    normalizeUrlForDedup("https://example.com/story?id=42&utm_source=rss&at_campaign=rss#section"),
    "https://example.com/story?id=42"
  )
})

test("empty and invalid URLs do not throw", () => {
  assert.equal(normalizeUrlForDedup(""), "")
  assert.equal(normalizeUrlForDedup("not-a-url"), "not-a-url")
})

test("selectFeedContent prefers fuller available feed text over a short teaser", () => {
  const fullText = "The agency announced a new programme. The programme includes funding for local authorities, a timetable for implementation, and new reporting requirements for participating organisations."
  const selected = selectFeedContent({
    content: fullText,
    contentSnippet: "The agency announced a new programme.",
    summary: "A programme was announced.",
  })

  assert.equal(selected.field, "content")
  assert.equal(selected.content, fullText)
})

test("selectFeedContent returns an empty result when all fields are empty", () => {
  assert.deepEqual(selectFeedContent({ content: "", contentSnippet: null, summary: undefined }), {
    content: "",
    field: "none",
    metadataOnly: false,
  })
})
