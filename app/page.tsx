import type { Metadata } from "next"
import { InfiniteNews } from "@/components/infinite-news"
import { FeaturedSection } from "@/components/featured-section"
import { CategoryFilter } from "@/components/category-filter"
import { getPublishedPosts, getCategories, getFeaturedPosts } from "@/lib/data-source"

export const revalidate = false

export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

export default async function HomePage() {
  const PAGE = 1
  const LIMIT = 18

  const [posts, categories, featuredPosts] = await Promise.all([
    getPublishedPosts(PAGE, LIMIT),
    getCategories(),
    getFeaturedPosts(),
  ])

  const featuredSlugs = new Set(featuredPosts.map((p) => p.slug))
  const regularPosts = posts.filter((p) => !featuredSlugs.has(p.slug))

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">

          {/* Featured Section */}
          {featuredPosts.length > 0 && (
            <div className="mb-10">
              <FeaturedSection posts={featuredPosts} />
            </div>
          )}

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="mb-8">
              <CategoryFilter categories={categories} />
            </div>
          )}

          {/* Latest News */}
          <section>
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full" />
              Latest News
            </h2>

            {regularPosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">
                No news articles available at the moment.
              </p>
            ) : (
              <InfiniteNews initialPosts={regularPosts} />
            )}
          </section>

        </div>
      </main>
    </div>
  )
}