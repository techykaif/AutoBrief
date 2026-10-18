const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8")
const sandbox = {
  Logger: { log() {} },
  PropertiesService: {
    getScriptProperties() {
      return { getProperty() { return "" } }
    }
  },
  Utilities: { sleep() {} },
  console
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: "Code.gs" })

function words(count, prefix = "detail") {
  return Array.from({ length: count }, (_, i) => prefix + i).join(" ")
}

test("holds old stories using the actual publication date", () => {
  assert.equal(
    sandbox.getSourceFreshnessStatus("2026-06-23T09:00:00.000Z", "2026-10-18T00:00:00.000Z"),
    "STALE_SOURCE"
  )
})

test("does not mistake a recent ingest time or row ID for a publication date", () => {
  // The second argument is the reference time; only the first argument is used
  // as the actual source publication date. An unknown publication date fails closed.
  assert.equal(
    sandbox.getSourceFreshnessStatus("", "2026-10-18T00:00:00.000Z"),
    "MISSING_SOURCE_DATE"
  )
})

test("holds rows with no verifiable publication date", () => {
  assert.equal(
    sandbox.getSourceFreshnessStatus(null, "2026-10-18T00:00:00.000Z"),
    "MISSING_SOURCE_DATE"
  )
})

test("holds implausibly future-dated publication timestamps", () => {
  assert.equal(
    sandbox.getSourceFreshnessStatus("2026-10-22T00:00:00.000Z", "2026-10-18T00:00:00.000Z"),
    "FUTURE_SOURCE_DATE"
  )
})

test("accepts fresh publication timestamps", () => {
  assert.equal(
    sandbox.getSourceFreshnessStatus("2026-10-17T12:00:00.000Z", "2026-10-18T00:00:00.000Z"),
    ""
  )
})

test("holds snippets with fewer than 25 words", () => {
  assert.equal(sandbox.isSufficientSourceText(words(24)), false)
  assert.equal(sandbox.isSufficientSourceText(words(25)), true)
})

test("article bounds scale with source length and limit padding for thin feeds", () => {
  const thin = sandbox.articleWordBounds(words(30))
  const medium = sandbox.articleWordBounds(words(150))
  const long = sandbox.articleWordBounds(words(550))

  assert.ok(thin.max <= 100)
  assert.ok(thin.min >= 18)
  assert.ok(medium.min >= 60)
  assert.ok(medium.max <= 220)
  assert.equal(long.max, 500)
})

test("accepts a grounded, multi-paragraph article within its source-based range", () => {
  const sourceText = words(100)
  const article = [
    "The transport agency announced a revised timetable for several regional routes after reviewing passenger demand and operating constraints. Officials said the changes are intended to make departures more consistent during the busiest travel periods.",
    "The revised schedule will list updated departure times and service intervals for affected stations. Passengers are being advised to check the published timetable before travelling, while the agency said further service details will be shared through its usual information channels."
  ].join("\n\n")

  assert.equal(sandbox.isValidArticleOutput(article, sourceText), true)
})

test("rejects repeated or near-repeated sentences", () => {
  const sourceText = words(100)
  const sentence = "The agency announced a revised timetable for regional routes after reviewing passenger demand."
  const article = [sentence, sentence, "Officials said the published schedule will show updated departures for affected stations."].join("\n\n")

  assert.equal(sandbox.hasRepetitiveSentences(article), true)
  assert.equal(sandbox.isValidArticleOutput(article, sourceText), false)
})

test("rejects excessive padding for a short source", () => {
  const sourceText = words(30)
  const repetitivePadding = [
    "The agency shared an update about the service after reviewing the available information. Officials said the update describes the latest changes and explains that more information will be available.",
    "The update provides details about the change and repeats that readers can look for more information. It also says the latest information describes the change and the details available to the public."
  ].join("\n\n") + " " + words(80, "filler")

  assert.equal(sandbox.isValidArticleOutput(repetitivePadding, sourceText), false)
})

test("rejects severely underwritten output for a richer source", () => {
  assert.equal(sandbox.isValidArticleOutput("Officials announced the change today.", words(180)), false)
})

test("requires paragraph structure for longer source material", () => {
  const sourceText = words(150)
  const oneParagraph = "Officials published an updated plan for the service. " + words(55, "supporting")
  assert.equal(sandbox.isValidArticleOutput(oneParagraph, sourceText), false)
})

test("summary validator rejects implausibly short and long summaries", () => {
  const sourceText = words(70)
  assert.equal(sandbox.isValidSummary("The plan changed.", sourceText), false)
  assert.equal(sandbox.isValidSummary(words(70), sourceText), false)
  assert.equal(
    sandbox.isValidSummary("Officials announced a revised timetable. The agency said updated departure details will be shared with passengers before the change begins.", sourceText),
    true
  )
})

test("article validation still rejects prompt leakage", () => {
  const sourceText = words(100)
  const article = "As an AI language model, I cannot verify these details. " + words(50)
  assert.equal(sandbox.isValidArticleOutput(article, sourceText), false)
})
