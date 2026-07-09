import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { Github, Globe, Twitter, Rss, Database, Bot, Cpu, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const SITE_URL = "https://autobrief-ai.netlify.app"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "About AutoBrief | Automated News Platform",
  description: "AutoBrief is a free, ad-free automated news platform built by Mohd Kaif Ansari. Powered by AI, RSS feeds and Google Sheets.",
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "AutoBrief",
  url: SITE_URL,
  founder: {
    "@type": "Person",
    name: "Mohd Kaif Ansari",
    jobTitle: "Founder & Developer",
  },
}

const TECH_STACK = [
  { icon: Rss,      label: "RSS Scraper",     detail: "50+ sources, every 30 min" },
  { icon: Database, label: "Google Sheets",    detail: "Pipeline & data store" },
  { icon: Bot,      label: "Groq AI",          detail: "Llama 3.3 70B — article writing" },
  { icon: Cpu,      label: "Next.js",          detail: "Static site, zero runtime DB" },
]

const PRINCIPLES = [
  {
    emoji: "🚫",
    title: "No Ads. Ever.",
    desc: "AutoBrief is a non-profit project. No advertisements, no tracking pixels, no sponsored content. Ever.",
  },
  {
    emoji: "🤖",
    title: "Fully Automated",
    desc: "From RSS ingestion to AI rewriting to publishing — zero manual intervention. The pipeline runs itself.",
  },
  {
    emoji: "⚡",
    title: "Blazing Fast",
    desc: "Fully static site served from a CDN. No server round-trips, no database queries on page load.",
  },
  {
    emoji: "🌍",
    title: "Open & Free",
    desc: "Free to read for everyone, everywhere. Built to make quality news accessible to all.",
  },
]

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">

          {/* Hero */}
          <section className="text-center mb-20">
            <div className="flex items-center justify-center w-24 h-24 mx-auto mb-6">
              <Image 
                src="/logo.png" 
                alt="AutoBrief Logo" 
                width={96} 
                height={96} 
                className="w-full h-full object-contain drop-shadow-2xl" 
              />
            </div>

            <Badge variant="secondary" className="mb-4">Non-profit · Ad-free · Open</Badge>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
              About AutoBrief
            </h1>

            <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mx-auto">
              AutoBrief is a fully automated news platform that ingests RSS feeds from 50+ sources,
              rewrites them into clear readable articles using AI, and publishes them — completely
              hands-free, completely free to read.
            </p>
          </section>

          {/* Principles */}
          <section className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full" />
              What We Stand For
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {PRINCIPLES.map(p => (
                <div
                  key={p.title}
                  className="p-6 border border-border rounded-xl bg-card hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="text-3xl mb-3">{p.emoji}</div>
                  <h3 className="font-semibold text-foreground mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full" />
              How It Works
            </h2>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

              {[
                { step: "01", title: "Scrape", desc: "GitHub Actions scrapes 50+ RSS feeds every 30 minutes and stores raw articles in Google Sheets." },
                { step: "02", title: "Process", desc: "Google Apps Script cleans the raw content, removes duplicates, and queues articles for AI processing." },
                { step: "03", title: "Write", desc: "Groq's Llama 3.3 70B rewrites each article into a clear, well-structured 3-paragraph news piece with an SEO headline." },
                { step: "04", title: "Publish", desc: "Once AI validates the content, articles are exported to a static JSON file, committed to GitHub, and Netlify rebuilds the site automatically." },
              ].map((item, i) => (
                <div key={i} className="flex gap-6 mb-8 relative">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold z-10">
                    {item.step}
                  </div>
                  <div className="pt-2 pb-6">
                    <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tech Stack */}
          <section className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full" />
              Tech Stack
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {TECH_STACK.map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="flex items-center gap-4 p-4 border border-border rounded-xl bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground">{detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Author */}
          <section className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full" />
              The Builder
            </h2>
            <div className="p-6 border border-border rounded-xl bg-card flex flex-col sm:flex-row items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-2xl font-bold text-primary">
                MK
              </div>
              <div className="flex-1">
                <div className="font-bold text-foreground text-lg mb-1">Mohd Kaif Ansari</div>
                <div className="text-sm text-muted-foreground mb-4">
                  Developer & Founder · Built AutoBrief as a non-profit project to make
                  quality news accessible to everyone, free of ads and paywalls.
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href="https://github.com/techykaif"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                  </a>
                  <a
                    href="https://autobrief-ai.netlify.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                    Website
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center">
            <div className="p-10 border border-border rounded-2xl bg-card">
              <h2 className="text-2xl font-bold mb-3">Start Reading</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Fresh AI-written news from 50+ sources, updated every 30 minutes.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
              >
                Browse Latest News
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
