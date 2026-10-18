import assert from "node:assert/strict"
import test from "node:test"
import { ensureUniquePostSlugs, isValidExportHeadline, validateExportArticle } from "./contentSafety"

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
    validateExportArticle("Researchers reported the study's findings after a detailed review of the evidence collected by the team at COP17.", shortSource, "Conference report").valid,
    true
  )
  assert.equal(
    validateExportArticle("The team said the final match ended after a close contest, and officials said their review of the full match report confirmed the score of 6-1.", shortSource, "Sports report").valid,
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

test("export validator rejects quotation marks around unsupported wording", () => {
  const source = "Officials said “We will review the proposal.” " +
    "They described the timetable and the limits of the current analysis."
  const grounded = "Officials said “We will review the proposal.” The review will continue with the available evidence and all submitted information."
  const invented = "Officials called it “a historic breakthrough” after the review. The report describes the timetable and its current limits."
  assert.equal(validateExportArticle(grounded, source, "Officials discuss a proposal").valid, true)
  assert.equal(validateExportArticle(invented, source, "Officials discuss a proposal").reason, "UNSUPPORTED_QUOTED_TEXT")
})

test("export headline validation rejects broken or malformed generated headings", () => {
  assert.equal(isValidExportHeadline("Council approves new transport plan"), true)
  assert.equal(isValidExportHeadline("Council approves new transport plan…"), false)
  assert.equal(isValidExportHeadline("Summary: Council approves a transport plan"), false)
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
