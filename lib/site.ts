// lib/site.ts
// Single source of truth for the site's canonical origin.
// Production serves from the www host: the apex (autobrief.blog) and the
// autobrief-ai.vercel.app domain both 308-redirect to it in Vercel, so
// canonical tags, Open Graph URLs, robots, sitemaps and structured data must
// all use this exact origin.
export const SITE_URL = "https://www.autobrief.blog"
