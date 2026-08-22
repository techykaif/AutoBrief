/* /news/[slug]/page.tsx */

import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { ShareButtons } from "@/components/share-buttons"
import { NewsCard } from "@/components/news-card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, User, Calendar, Clock, BookOpen } from "lucide-react"
import { getPostBySlug, getPostsByCategory, getAllPosts } from "@/lib/data-source"

const SITE_URL = "https://autobrief-ai.vercel.app"

export const revalidate = false

// getAllPosts() now returns only the bounded "recent window" written by
// scripts/export/export-posts.ts (data/posts.json), not the full archive —
// so this only prerenders recent articles at build time.
// dynamicParams defaults to true, but is set explicitly here because the
// whole point of the archive split is relying on it: a slug outside the
// recent window (i.e. an archived post) still renders correctly, just on
// first request instead of at build time, then caches indefinitely
// (revalidate = false) like the prerendered pages.
export const dynamicParams = true

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const posts = await getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return { title: "Post Not Found | AutoBrief" }

  const description = post.content.substring(0, 160)
  return {
    title: `${post.title} | AutoBrief`,
    description,
    alternates: { canonical: `/news/${post.slug}` },
    openGraph: {
      title: post.title,
      description,
      url: `/news/${post.slug}`,
      type: "article",
      publishedTime: post.publishedAt,
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  }
}

export default async function NewsPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const categoryPosts = await getPostsByCategory(post.category)
  const relatedPosts = categoryPosts.filter((p) => p.slug !== post.slug).slice(0, 3)

  const formattedDate = new Date(post.publishedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  })

  const wordCount = post.content.trim().split(/\s+/).length
  const readingTime = post.readingTime ?? Math.max(1, Math.ceil(wordCount / 200))
  const paragraphs = post.content.split("\n\n").filter(Boolean)

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    datePublished: post.publishedAt,
    author: { "@type": "Person", name: post.author || "AutoBrief" },
    publisher: { "@type": "Organization", name: "AutoBrief" },
    description: post.content.substring(0, 160),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/news/${post.slug}`,
    },
  }

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <article className="container mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to news
        </Link>

        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <header className="mb-8 pb-8 border-b border-border">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Link href={`/category/${post.category.toLowerCase().replace(/\s+/g, "-")}`}>
                <Badge className="hover:opacity-80 transition cursor-pointer">{post.category}</Badge>
              </Link>
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-6">
              {post.title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {post.author && (
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4" />{post.author}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <time dateTime={post.publishedAt}>{formattedDate}</time>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />{readingTime} min read
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />{wordCount.toLocaleString()} words
              </span>
            </div>
          </header>

          {/* Share */}
          <div className="flex justify-end mb-8">
            <ShareButtons title={post.title} />
          </div>

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-12">
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="leading-relaxed mb-6 text-foreground/90">
                {paragraph}
              </p>
            ))}
          </div>

          {/* AI disclosure */}
          <div className="mb-12 p-4 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
            <span className="font-medium">🤖 AI-generated content</span> — This article was automatically summarised from public RSS feeds by AutoBrief. Verify important information with the original source.
          </div>

          {/* Related */}
          {relatedPosts.length > 0 && (
            <section className="border-t border-border pt-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-primary rounded-full" />
                Related Articles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((related) => (
                  <NewsCard key={related.id} post={related} />
                ))}
              </div>
            </section>
          )}

        </div>
      </article>
    </div>
  )
}
