# AutoBrief — Automated News Platform

AutoBrief is a production Next.js news platform with an automated content pipeline. News is collected from RSS sources, processed through the Google Sheets/AI workflow, exported into versioned static JSON data, and served by the website from that generated dataset.

This repository contains both the web application and the automation scripts that keep its news dataset current.

## Production Architecture

```text
RSS Sources
    ↓
GitHub Actions RSS Scraper
    ↓
Google Sheets / AI Processing
    ↓
Automated Export
    ↓
Static JSON Dataset committed to Git
    ↓
Next.js Website
    ↓
Users / JSON APIs
```

### Runtime data model

The deployed website uses the **static data provider by default** (`DATA_PROVIDER=static`). This means the production site does not need to query Google Sheets for every request.

Generated data is stored under `data/`:

- `data/posts.json` — the latest 500 posts used for the primary news experience.
- `data/archive-index.json` — maps archived article slugs to their monthly shard.
- `data/archive/YYYY-MM.json` — monthly archive shards for older articles.
- `data/meta.json` — generated dataset metadata and counts.

When an archived article is requested, AutoBrief uses the archive index to load only the relevant monthly shard instead of scanning the entire archive.

Google Sheets remains the upstream content and AI-processing layer used by the automation pipeline. The application also contains a Sheets provider for environments that explicitly set `DATA_PROVIDER=sheets`.

---

## Automation

AutoBrief is designed to run continuously with GitHub Actions rather than requiring manual content publishing.

### 1. RSS ingestion

`.github/workflows/rss-scraper.yml` runs on a schedule every 30 minutes and can also be started manually. It:

1. Installs the locked Node.js dependencies.
2. Runs `scripts/rss/rssScraper.ts`.
3. Reads the configured Google Sheets credentials from GitHub Actions secrets.
4. Collects and processes new RSS content for the upstream workflow.

### 2. Export and deployment

`.github/workflows/export-posts.yml` is manually dispatchable and is also compatible with the external automation that triggers the production export flow.

The export workflow:

1. Checks out `main`.
2. Runs `scripts/export/export-posts.ts`.
3. Regenerates the static JSON dataset under `data/`.
4. Commits changed data files to `main` using the GitHub Actions bot.
5. Pushes the generated dataset.
6. Triggers the configured Vercel deploy hook when one is available.

The repository history shows the automated data commits being produced successfully, so the generated dataset is an active part of the production workflow.

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
git clone https://github.com/techykaif/AutoBrief.git
cd AutoBrief
npm ci
```

### Run locally

```bash
npm run dev
```

The development server runs at `http://localhost:3000` by default.

### Build and run production locally

```bash
npm run build
npm run start
```

### Lint

```bash
npm run lint
```

---

## Environment Variables

### Website

The default static provider reads generated files from the repository, so the deployed website does not require Google Sheets credentials for normal static-data operation.

If you explicitly use the Google Sheets provider, set:

```env
DATA_PROVIDER=sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@example.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_google_sheet_id
```

The private key is normalized by the application so escaped newlines can be used in environment-variable based deployments.

### Automation secrets

The GitHub Actions RSS and export workflows require these repository secrets:

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

The export workflow can additionally use:

- `VERCEL_DEPLOY_HOOK`

Never commit service-account credentials or private keys to the repository.

---

## API Reference

All API routes are available under `/api/*`.

### `GET /api/news`

Returns published news and supports category filtering and a result limit.

```bash
curl "http://localhost:3000/api/news?limit=10"
curl "http://localhost:3000/api/news?category=technology&limit=10"
```

### `GET /api/post`

Returns a single article by slug.

```bash
curl "http://localhost:3000/api/post?slug=example-slug"
```

### `GET /api/categories`

Returns available categories and their counts.

```bash
curl http://localhost:3000/api/categories
```

### `GET /api/search`

Searches the published news dataset.

```bash
curl "http://localhost:3000/api/search?q=electric%20vehicle&limit=10"
```

### `GET /api/health`

Returns a lightweight health response with status, timestamp, and application version.

```bash
curl http://localhost:3000/api/health
```

### `GET /api/status`

Returns application/data status information used by the platform's status surface.

### `POST /api/track`

Handles the application's visit-tracking operation.

---

## Data Model

The canonical application type definitions are in `lib/types.ts`.

A news post contains fields such as:

```json
{
  "id": "123",
  "title": "Final Title",
  "slug": "final-title",
  "content": "Article content",
  "category": "Technology",
  "publishedAt": "2026-01-01T12:00:00.000Z",
  "author": "Author Name",
  "isFeatured": true
}
```

### Google Sheets source schema

The Sheets integration expects the `FINAL_BLOGS` sheet with the following zero-based column mapping:

| Index | Field |
|---:|---|
| 0 | `id` |
| 1 | `source_id` |
| 2 | `title` |
| 3 | `slug` |
| 4 | `content_base` |
| 5 | `summary_base` |
| 6 | `category` |
| 7 | `author` |
| 8 | `published_at` |
| 9 | `is_published` |
| 10 | `is_featured` |
| 11 | `seo_title_base` |
| 12 | `seo_description_base` |
| 13 | `processing_status` |
| 14 | `ai_summary` |
| 15 | `ai_content` |
| 16 | `ai_seo_title` |

The Sheets provider applies the production AI gating rules when `processing_status` is `LIVE`, while base content remains available as the fallback path defined by the application.

---

## Project Structure

```text
app/                    Next.js App Router pages and API routes
components/             Reusable UI components
hooks/                  Client-side hooks
lib/                    Data providers, Google Sheets integration, types and utilities
scripts/
  rss/                  RSS ingestion automation
  export/               Static dataset generation
  check-env.ts          Environment validation helper
data/
  posts.json            Latest generated posts
  archive-index.json    Archived slug lookup index
  archive/*.json        Monthly archive shards
  meta.json             Generated dataset metadata
public/                 Static assets
.github/workflows/      Automation workflows
```

### Important entry points

- `lib/data-source.ts` — selects the static or Sheets data provider.
- `lib/static-data.ts` — reads recent posts and archive shards.
- `lib/google-sheets.ts` — Google Sheets integration.
- `scripts/rss/rssScraper.ts` — RSS ingestion.
- `scripts/export/export-posts.ts` — generated dataset export.
- `app/page.tsx` — homepage.
- `app/api/*` — JSON API surface.

---

## Development Notes

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Google authentication via `google-auth-library`
- RSS parsing via `rss-parser`
- Vercel-compatible deployment configuration

`next.config.mjs` currently enables unoptimized image delivery and compression. It does **not** disable TypeScript build checking.

The static data provider keeps the deployed application independent from live Sheets reads while preserving the Sheets provider for explicit use cases.

---

## Troubleshooting

### Google Sheets authentication errors

If the RSS scraper or Sheets provider returns authorization errors:

1. Confirm the service account email is correct.
2. Confirm the target Google Sheet is shared with the service account.
3. Confirm the Google Sheets API is enabled for the relevant Google Cloud project.
4. Confirm `GOOGLE_PRIVATE_KEY` is correctly configured, including newline handling.

### Missing Google Sheet ID

Set `GOOGLE_SHEET_ID` to the ID contained in the Google Sheets URL:

```text
https://docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/edit
```

### Empty website data

For the static provider, verify that the generated files exist and contain valid JSON:

- `data/posts.json`
- `data/meta.json`
- `data/archive-index.json`

If the automation pipeline is the source of the problem, inspect the relevant GitHub Actions workflow run and the latest generated data commit.

### Archived article not found

An archived article must have a matching entry in `data/archive-index.json` and the corresponding monthly archive shard under `data/archive/`.

---

## Deployment

The repository includes a Vercel configuration (`vercel.json`) for the Next.js application.

Production deployment uses the generated static dataset committed under `data/`. When the export automation updates that dataset, the deployment flow can trigger a new Vercel build through the configured deploy hook.

For a deployment environment:

1. Configure the required build/runtime settings for the application.
2. Configure Google credentials only where the Sheets provider or automation requires them.
3. Keep service-account credentials in secure environment variables or GitHub Actions secrets.
4. Verify the generated data files are present after export.
5. Verify the health endpoint after deployment.

---

## Automation Safety Notes

AutoBrief treats generated news data as a production artifact. Changes to application code and changes to generated content are separate concerns:

- Application changes should be reviewed through the normal Git workflow.
- Generated `data/` changes are produced by the automation pipeline.
- Do not hand-edit generated JSON unless intentionally repairing the generated dataset.
- Keep credentials out of source control.

---

## Contributing

Before changing application behavior:

1. Create an issue describing the change or problem.
2. Create a focused branch from `main`.
3. Keep the change scoped to the issue.
4. Run the relevant checks locally.
5. Open a pull request against `main`.
6. Review the diff and validation results before merging.

Documentation-only changes should remain documentation-only and must not modify production code or automation behavior.

---

## Current Production Philosophy

AutoBrief is intentionally automated and data-driven. The goal is not to introduce infrastructure changes simply because alternative architectures exist; changes should be made when they provide a concrete production benefit, solve a demonstrated problem, or reduce a meaningful operational risk.

For maintainers, start by checking the automation runs, generated data commits, and application health before treating an observed behavior as a production issue.

---

## License

See the repository for the current project licensing terms.