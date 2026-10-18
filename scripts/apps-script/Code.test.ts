import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"

const sourceCode = readFileSync(resolve(process.cwd(), "apps-script/Code.gs"), "utf8")
const runtime: Record<string, any> = {
  Logger: { log: () => undefined },
}
runInNewContext(sourceCode, runtime, { timeout: 1000 })

test("complete Apps Script loads in the V8-compatible test context", () => {
  assert.equal(typeof runtime.masterAutomation, "function")
  assert.equal(typeof runtime.processRawNewsToFinalBlogs, "function")
  assert.equal(typeof runtime.validateArticleOutput, "function")
})

test("rejects ellipses, missing punctuation, and dangling clause endings", () => {
  assert.equal(runtime.hasIncompleteArticleEnding("Officials discussed the deal and…"), true)
  assert.equal(runtime.hasIncompleteArticleEnding("Officials discussed the deal and."), true)
  assert.equal(runtime.hasIncompleteArticleEnding("Officials discussed the deal"), true)
})

test("accepts complete endings with acronyms, dates, years, and sports scores", () => {
  assert.equal(runtime.hasIncompleteArticleEnding("Delegates will meet again at COP17."), false)
  assert.equal(runtime.hasIncompleteArticleEnding("The report was published on September 24."), false)
  assert.equal(runtime.hasIncompleteArticleEnding("The programme runs through July 2027."), false)
  assert.equal(runtime.hasIncompleteArticleEnding("The final score was 6-1."), false)
  assert.equal(runtime.hasIncompleteArticleEnding("The meeting ended in the U.S."), false)
})

test("podcast listing detector recognises show-note/listing signals", () => {
  const title = "How Michael Gove justifies his politics | Radical Thinking with Aditya Chakrabortty"
  const source = "Listen to the latest episode of the podcast. Suggested reading follows. Topics include economics and politics."
  assert.equal(runtime.isEpisodeListing(title, source), true)
  assert.equal(runtime.isEpisodeListing("Reporter discusses a podcast episode", "The reporter discussed a podcast episode at a press conference and shared three facts."), false)
})

test("overlong podcast-listing output is rejected with an explicit reason", () => {
  const title = "How Michael Gove justifies his politics | Radical Thinking with Aditya Chakrabortty"
  const source = ("Listen to the latest episode of the podcast. Suggested reading. Topics include economics and politics. " +
    "The programme lists themes without publishing a full transcript. ").repeat(30)
  const article = Array.from({ length: 180 }, (_, i) => "distinctiveword" + String(i)).join(" ") + "."
  const result = runtime.validateArticleOutput(article, source, title)
  assert.equal(result.valid, false)
  assert.match(result.reason, /^TOO_LONG:/)
})

test("empty titles never cause every article to be classified as a duplicate", () => {
  assert.equal(runtime.isSimilarTitle("", "An unrelated report about science"), false)
  assert.equal(runtime.isSimilarTitle("   ", "   "), false)
})

test("title dedup normalizes accents and finds close headline variants", () => {
  assert.equal(
    runtime.isSimilarTitle("Gómez scores Brighton's wondergoal", "Gomez scores Brighton s wondergoal"),
    true
  )
  assert.equal(
    runtime.isSimilarTitle("Scientists discover a new way to reverse coral bleaching", "Scientists find a new way to reverse coral bleaching"),
    true
  )
  assert.equal(runtime.isSimilarTitle("Weather forecast", "Weather warning"), false)
})

test("base-summary fallback never truncates a single sentence with an ellipsis", () => {
  const source = "Researchers studied a rare phenomenon and reported a detailed set of observations that could help explain the behaviour of the system under different environmental conditions without establishing a final conclusion."
  const summary = runtime.generateBaseSummary(source)
  assert.equal(summary.endsWith("…"), false)
  assert.equal(summary, runtime.cleanText(source))
})

test("bulk retry command is fail-closed instead of resetting historical failures", () => {
  const start = sourceCode.indexOf("function resetAiFailedToNew() {")
  const end = sourceCode.indexOf("function backfillSourceUrls()", start)
  assert.ok(start >= 0 && end > start)
  assert.match(sourceCode.slice(start, end), /throw new Error\(message\)/)
  assert.doesNotMatch(sourceCode.slice(start, end), /setValue\("NEW"\)/)
})
