# AutoBrief Apps Script quality patch

This directory contains the proposed Apps Script source for the article-generation follow-up.

## What changed

- Content under 25 words is marked `INSUFFICIENT_SOURCE` and is not sent to the model or published.
- Article length ranges scale with the available source instead of relying on a single minimum-only word gate.
- Model responses that fail article validation are rejected so the next configured model can be tried.
- Validation rejects repeated/near-repeated sentences, out-of-range length, prompt leakage, and missing paragraph structure for longer sources.
- Summary validation is more deliberate; invalid summaries fall back to the existing source-derived summary.

## Deployment boundary

This source is **not automatically deployed** to the Google Apps Script project and this PR does not modify the live spreadsheet. After review and testing, the changes must be copied into the Apps Script editor or deployed through an explicitly configured `clasp` workflow. Keep a backup of the existing script before applying it.

## Status behavior

Rows with insufficient input are tagged `INSUFFICIENT_SOURCE`, not `AI_FAILED`. They do not get repeatedly retried by the existing `resetAiFailedToNew()` helper. After the source has been enriched, change those rows back to `NEW` for reprocessing.
