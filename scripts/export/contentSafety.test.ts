import assert from "node:assert/strict"
import test from "node:test"
import { ensureUniquePostSlugs, validateExportArticle } from "./contentSafety"

const shortSource = [
  "Researchers reported the discovery of a previously unobserved pattern.",
  "The team described measurements collected during the study and explained the limits of the current analysis.",
  "The source does not establish what caused the pattern or what it means for future applications.",
].join(" ")

const completeArticle =
  "Researchers reported a previously unobserved pattern. The team described measurements collected during the study, while noting that the available evidence does not establish the cause or future implications."

test("export validator accepts a complete source-grounded short article", () => {
  const result = validateExportArticle(completeArticle, shortSource, "Researchers report a new pattern")
  assert.equal(result.valid, true)
  assert.equal(result.reason, "OK")
})

test("export validator rejects terminal ellipses and dangling clauses", () => {
  assert.equal(validateExportArticle("Researchers reported the results and…", shortSource, "Research report").reason,
    "INCOMPLETE_OR_DANGLING_ENDING")
  assert.equal(validateExportArticle("Researchers reported the results and.", shortSource, "Research report").valid, false)
})

test("export validator accepts valid numeric and alphanumeric sentence endings", () => {
  assert.equal(
    validateExportArticle("Researchers presented the findings at COP17.", shortSource, "Conference report").valid,
    true
  )
  assert.equal(
    validateExportArticle("The final match ended with a score of 6-1.", shortSource, "Sports report").valid,
    true
  )
})

test("export validator rejects a 180-word podcast listing as too long", () => {
  const title = "How Michael Gove justifies his politics | Radical Thinking with Aditya Chakrabortty"
  const source = ("Listen to the latest episode of the podcast. Suggested reading follows. Topics include economics and politics. " +
    "The programme lists themes without publishing a full transcript. ").repeat(30)
  const article = Array.from({ length: 180 }, (_, i) => "distinctiveword" + String(i)).join(" ") + "."
  const result = validateExportArticle(article, source, title)
  assert.equal(result.valid, false)
  assert.match(result.reason, /^TOO_LONG:/)
})

test("slug collisions get distinct incrementing suffixes", () => {
  const posts = [
    { id: "1", title: "Story One", slug: "same-slug" },
    { id: "2", title: "Story Two", slug: "same-slug" },
    { id: "3", title: "Story Three", slug: "same-slug" },
  ]
  assert.deepEqual(ensureUniquePostSlugs(posts).map(post => post.slug), [
    "same-slug", "same-slug-1", "same-slug-2",
  ])
})

test("slug suffixes stay within the configured maximum length", () => {
  const base = "a".repeat(80)
  const posts = [
    { id: "1", title: "One", slug: base },
    { id: "2", title: "Two", slug: base },
  ]
  const slugs = ensureUniquePostSlugs(posts, 80).map(post => post.slug)
  assert.equal(slugs.every(slug => slug.length <= 80), true)
  assert.notEqual(slugs[0], slugs[1])
})
