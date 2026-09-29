# Current Improvements

This file records the small AutoBrief improvements that are currently applied, plus the work deliberately left for a later pass.

## Applied in this PR

### RSS source observability
- The 30-minute RSS scraper now writes the **last successful RSS fetch time** to `SOURCES!F:F` (`last_fetched`).
- Existing timestamps are preserved for sources that are disabled, invalid, or fail to fetch.
- The update is batched after the scrape so the run does not issue a separate Sheets write for every source.

### Search metadata
- `scripts/export/export-posts.ts` now carries the generated FINAL_BLOGS summary into `data/posts.json`.
- Article metadata now uses that summary for the page description, falling back to the existing content snippet when a summary is unavailable.

### NewsArticle structured data
- The current `author` field is represented as an `Organization` in Article JSON-LD, matching the current dataset where this field is normally a publication/source name.
- The generated per-article Open Graph image is now included in the Article structured-data `image` property.

## Intentionally deferred

### Apps Script content-generation patch
- The Google Apps Script that generates headlines, summaries, and articles was **not changed in this PR**.
- The planned follow-up is to improve article-generation guidance and validation without inventing facts or padding thin RSS inputs.

### Larger SEO / architecture work
- No robots.txt changes.
- No sitemap redesign.
- No canonical/domain redesign.
- No archive-storage rewrite.
- No full-archive category/search rewrite.
- No homepage pagination/infinite-scroll redesign.
- No new archive-wide internal-linking system.

These are intentionally separate so the current working architecture stays stable and the small changes can be evaluated incrementally.
