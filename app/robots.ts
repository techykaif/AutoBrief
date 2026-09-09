import type { MetadataRoute } from "next"

const SITE_URL = "https://autobrief-ai.vercel.app"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: "/api/",
      },
      {
        userAgent: "OAI-AdsBot",
        allow: "/",
        disallow: "/api/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
