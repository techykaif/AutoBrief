import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { NewsCard } from "@/components/news-card"
import { CategoryFilter } from "@/components/category-filter"
import { Badge } from "@/components/ui/badge"
import { getPostsByCategory, getCategories } from "@/lib/data-source"
import {
  Globe, Cpu, FlaskConical, TrendingUp, Heart,
  Leaf, Landmark, Trophy, Tv, Rocket, LayoutGrid
} from "lucide-react"

export const revalidate = false

interface PageProps {
  params: Promise<{ slug: string }>
}

const CATEGORY_META: Record<string, { icon: any; color: string; bg: string }> = {
  world:         { icon: Globe,        color: "text-blue-500",    bg: "bg-blue-500/10" },
  technology:    { icon: Cpu,          color: "text-violet-500",  bg: "bg-violet-500/10" },
  science:       { icon: FlaskConical, color: "text-cyan-500",    bg: "bg-cyan-500/10" },
  business:      { icon: TrendingUp,   color: "text-emerald-500", bg: "bg-emerald-500/10" },
  health:        { icon: Heart,        color: "text-rose-500",    bg: "bg-rose-500/10" },
  environment:   { icon: Leaf,         color: "text-green-500",   bg: "bg-green-500/10" },
  politics:      { icon: Landmark,     color: "text-orange-500",  bg: "bg-orange-500/10" },
  sports:        { icon: Trophy,       color: "text-yellow-500",  bg: "bg-yellow-500/10" },
  entertainment: { icon: Tv,           color: "text-pink-500",    bg: "bg-pink-500/10" },
  space:         { icon: Rocket,       color: "text-indigo-500",  bg: "bg-indigo-500/10" },
}

function getCategoryMeta(slug: string) {
  return CATEGORY_META[slug.toLowerCase()] ?? {
    icon: LayoutGrid, color: "text-primary", bg: "bg-primary/10",
  }
}

export async function generateStaticParams() {
  const categories = await getCategories()
  return categories.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const name = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ")
  return {
    title: `${name} News | AutoBrief`,
    description: `Latest ${name} news and articles on AutoBrief.`,
    alternates: { canonical: `/category/${slug}` },
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params
  const [posts, categories] = await Promise.all([
    getPostsByCategory(slug),
    getCategories(),
  ])

  if (posts.length === 0 && !categories.find((c) => c.slug === slug)) {
    notFound()
  }

  const { icon: Icon, color, bg } = getCategoryMeta(slug)
  const categoryName = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ")

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-6xl">

        {/* Category hero banner */}
        <div className={`rounded-2xl p-8 mb-8 ${bg} border border-border`}>
          <div className="flex items-center gap-4 mb-3">
            <div className={`w-12 h-12 rounded-xl ${bg} border border-border flex items-center justify-center`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{categoryName}</h1>
              <p className="text-sm text-muted-foreground">
                {posts.length} article{posts.length !== 1 ? "s" : ""} · Updated every 30 minutes
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="mt-2">
            {categoryName} News
          </Badge>
        </div>

        {/* Category filter */}
        <div className="mb-8">
          <CategoryFilter categories={categories} />
        </div>

        {/* Articles grid */}
        {posts.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            No articles in this category yet. Check back soon.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <NewsCard key={post.id} post={post} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
