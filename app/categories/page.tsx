import Link from "next/link"
import type { Metadata } from "next"
import { getCategories } from "@/lib/data-source"
import { Badge } from "@/components/ui/badge"
import {
  Globe, Cpu, FlaskConical, TrendingUp, Heart,
  Leaf, Landmark, Trophy, Tv, Rocket, LayoutGrid
} from "lucide-react"

export const revalidate = false

export const metadata: Metadata = {
  title: "Categories | AutoBrief",
  description: "Browse all news categories on AutoBrief — World, Technology, Science, Business, Health, Environment, Politics, Sports, Entertainment, Space.",
  alternates: { canonical: "/categories" },
}

const CATEGORY_META: Record<string, { icon: any; color: string; bg: string }> = {
  world:         { icon: Globe,         color: "text-blue-500",   bg: "bg-blue-500/10" },
  technology:    { icon: Cpu,           color: "text-violet-500", bg: "bg-violet-500/10" },
  science:       { icon: FlaskConical,  color: "text-cyan-500",   bg: "bg-cyan-500/10" },
  business:      { icon: TrendingUp,    color: "text-emerald-500",bg: "bg-emerald-500/10" },
  health:        { icon: Heart,         color: "text-rose-500",   bg: "bg-rose-500/10" },
  environment:   { icon: Leaf,          color: "text-green-500",  bg: "bg-green-500/10" },
  politics:      { icon: Landmark,      color: "text-orange-500", bg: "bg-orange-500/10" },
  sports:        { icon: Trophy,        color: "text-yellow-500", bg: "bg-yellow-500/10" },
  entertainment: { icon: Tv,            color: "text-pink-500",   bg: "bg-pink-500/10" },
  space:         { icon: Rocket,        color: "text-indigo-500", bg: "bg-indigo-500/10" },
}

function getCategoryMeta(slug: string) {
  return CATEGORY_META[slug.toLowerCase()] ?? {
    icon: LayoutGrid,
    color: "text-primary",
    bg: "bg-primary/10",
  }
}

export default async function CategoriesPage() {
  const categories = await getCategories()
  const total = categories.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-5xl">

        {/* Header */}
        <div className="mb-12">
          <Badge variant="secondary" className="mb-3">
            {categories.length} categories · {total.toLocaleString()} articles
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 tracking-tight">
            Browse by Category
          </h1>
          <p className="text-muted-foreground">
            Explore news across {categories.length} topics, updated every 30 minutes.
          </p>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            No categories available yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories
              .sort((a, b) => b.count - a.count)
              .map(category => {
                const { icon: Icon, color, bg } = getCategoryMeta(category.slug)
                const pct = Math.round((category.count / total) * 100)

                return (
                  <Link key={category.slug} href={`/category/${category.slug}`}>
                    <div className="group relative p-5 border border-border rounded-xl bg-card hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 h-full">

                      {/* Icon + name */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                          <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {category.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {category.count} article{category.count !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color.replace("text-", "bg-")} transition-all`}
                          style={{ width: `${Math.max(5, pct * 3)}%` }}
                        />
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-muted-foreground">{pct}% of all articles</span>
                        <span className={`text-xs font-medium ${color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                          Browse →
                        </span>
                      </div>

                    </div>
                  </Link>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
