import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/react"
import { ThemeProvider } from "@/components/theme-provider"
import { VisitTracker } from "@/components/visit-tracker"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  metadataBase: new URL("https://autobrief-ai.vercel.app"),
  title: {
    default: "AutoBrief — Automated News Aggregation",
    template: "%s | AutoBrief",
  },
  description:
    "Free, ad-free automated news. AI-written articles from 50+ sources updated every 30 minutes.",
  keywords: ["news", "automation", "technology", "science", "finance", "autobrief"],
  authors: [{ name: "Mohd Kaif Ansari" }],
  creator: "Mohd Kaif Ansari",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "AutoBrief",
    title: "AutoBrief — Automated News Aggregation",
    description: "Free, ad-free automated news from 50+ sources.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoBrief — Automated News Aggregation",
    description: "Free, ad-free automated news from 50+ sources.",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
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
