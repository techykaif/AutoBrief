import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/react"
import { ThemeProvider } from "@/components/theme-provider"
import { VisitTracker } from "@/components/visit-tracker"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { SITE_URL } from "@/lib/site"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AutoBrief - Automated News Aggregation",
    template: "%s | AutoBrief",
  },
  description:
    "Free, ad-free automated news. AI-written articles from 50+ sources updated every 30 minutes.",
  keywords: ["news", "automation", "technology", "science", "finance", "autobrief"],
  authors: [{ name: "Mohd Kaif Ansari" }],
  creator: "Mohd Kaif Ansari",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  verification: {
    google: "JaS2NIRQlSYOw0XEaYrSQP3RYE3kwbgxy5tV-6w4-x8",
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "1024x1024" }],
    shortcut: [{ url: "/favicon.png", type: "image/png", sizes: "1024x1024" }],
    apple: [{ url: "/favicon.png", type: "image/png", sizes: "1024x1024" }],
  },
  openGraph: {
    type: "website",
    siteName: "AutoBrief",
    url: SITE_URL,
    title: "AutoBrief - Automated News Aggregation",
    description: "Free, ad-free automated news from 50+ sources.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoBrief - Automated News Aggregation",
    description: "Free, ad-free automated news from 50+ sources.",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "AutoBrief",
  url: SITE_URL,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
        />
        <ThemeProvider>
          <VisitTracker />
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
