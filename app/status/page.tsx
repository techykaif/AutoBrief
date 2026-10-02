"use client"

import { useEffect, useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Activity, FileText, Users, Clock, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react"

type HealthStatus = "OK" | "DOWN" | "CHECKING"

interface StatusData {
  totalArticles: number
  todayArticles: number
  weekArticles: number
  totalVisits: number
  categories: number
  categoryBreakdown: { name: string; slug: string; count: number }[]
  lastUpdated: string | null
  timestamp: string
}

interface HistoryEntry {
  status: HealthStatus
  time: number
  responseTime: number
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="p-5 border border-border rounded-xl bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return "just now"
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthStatus>("CHECKING")
  const [responseTime, setResponseTime] = useState<number | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState<StatusData | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Track visit - fire once on mount
  useEffect(() => {
    if (!mounted) return
    const key = "ab_last_track"
    const last = localStorage.getItem(key)
    const now = Date.now()
    // Only track once every 5 minutes per browser
    if (!last || now - parseInt(last) > 5 * 60 * 1000) {
      fetch("/api/track", { method: "POST" }).catch(() => {})
      localStorage.setItem(key, String(now))
    }
  }, [mounted])

  const checkHealth = useCallback(async () => {
    const start = performance.now()
    try {
      const res = await fetch("/api/health", { cache: "no-store" })
      const time = Math.round(performance.now() - start)
      const data = await res.json()
      const newStatus: HealthStatus = data.status === "OK" ? "OK" : "DOWN"
      setHealth(newStatus)
      setResponseTime(time)
      setLastChecked(new Date())
      setHistory(prev => [
        { status: newStatus, time: Date.now(), responseTime: time },
        ...prev.slice(0, 59),
      ])
    } catch {
      const time = Math.round(performance.now() - start)
      setHealth("DOWN")
      setResponseTime(time)
      setLastChecked(new Date())
      setHistory(prev => [
        { status: "DOWN", time: Date.now(), responseTime: time },
        ...prev.slice(0, 59),
      ])
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      // silent fail
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([checkHealth(), fetchStats()])
    setRefreshing(false)
  }, [checkHealth, fetchStats])

  useEffect(() => {
    if (!mounted) return
    checkHealth()
    fetchStats()
  }, [mounted, checkHealth, fetchStats])

  // Auto refresh health every 30s, stats every 5 mins
  useEffect(() => {
    const healthInterval = setInterval(checkHealth, 30000)
    const statsInterval = setInterval(fetchStats, 5 * 60 * 1000)
    return () => {
      clearInterval(healthInterval)
      clearInterval(statsInterval)
    }
  }, [checkHealth, fetchStats])

  const uptimePct = history.length === 0 ? 100
    : Math.round((history.filter(h => h.status === "OK").length / history.length) * 100)

  const avgResponse = history.length === 0 ? 0
    : Math.round(history.reduce((s, h) => s + h.responseTime, 0) / history.length)

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-4xl">

        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">System Status</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live monitoring · Auto-refreshes every 30s
            </p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Health banner */}
        <div className={`rounded-xl border p-5 mb-6 flex items-center justify-between transition-colors ${
          health === "OK"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : health === "DOWN"
            ? "border-red-500/30 bg-red-500/5"
            : "border-border bg-card"
        }`}>
          <div className="flex items-center gap-3">
            {health === "CHECKING" && <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />}
            {health === "OK" && <CheckCircle className="w-5 h-5 text-emerald-500" />}
            {health === "DOWN" && <XCircle className="w-5 h-5 text-red-500" />}
            <div>
              <div className="font-semibold text-foreground">
                {health === "CHECKING" && "Checking systems..."}
                {health === "OK" && "All Systems Operational"}
                {health === "DOWN" && "Service Unavailable"}
              </div>
              {lastChecked && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Last checked {lastChecked.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            {responseTime !== null && (
              <div className="text-sm font-medium text-foreground">{responseTime}ms</div>
            )}
            <div className="text-xs text-muted-foreground">response</div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={Users}
            label="Total Visits"
            value={statsLoading ? "-" : (stats?.totalVisits ?? 0).toLocaleString()}
            sub="all time"
          />
          <StatCard
            icon={FileText}
            label="Articles"
            value={statsLoading ? "-" : (stats?.totalArticles ?? 0).toLocaleString()}
            sub={stats ? `+${stats.todayArticles} today` : undefined}
          />
          <StatCard
            icon={Activity}
            label="Uptime"
            value={`${uptimePct}%`}
            sub={`avg ${avgResponse}ms`}
          />
          <StatCard
            icon={Clock}
            label="Last Updated"
            value={statsLoading || !stats?.lastUpdated ? "-" : timeAgo(stats.lastUpdated)}
            sub={stats?.lastUpdated ? formatTime(stats.lastUpdated) : undefined}
          />
        </div>

        {/* Two column: categories + health history */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

          {/* Category breakdown */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">
              Top Categories
            </div>
            {statsLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : stats?.categoryBreakdown.length ? (
              <div className="space-y-3">
                {stats.categoryBreakdown.map(cat => (
                  <div key={cat.slug} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded-full bg-primary/20 w-20 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(100, (cat.count / (stats?.totalArticles || 1)) * 100 * 3)}%`
                          }}
                        />
                      </div>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {cat.count}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No data yet</div>
            )}
          </div>

          {/* Pipeline info */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">
              Pipeline
            </div>
            <div className="space-y-3">
              {[
                { label: "RSS Scraper", detail: "Every 30 minutes", ok: true },
                { label: "AI Processing", detail: "Groq Llama 3.3 70B", ok: true },
                { label: "Export & Deploy", detail: "Auto after processing", ok: true },
                { label: "Sources", detail: `${stats?.categories ?? "-"} categories active`, ok: true },
                { label: "This week", detail: stats ? `${stats.weekArticles} articles published` : "-", ok: true },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${item.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-sm text-foreground">{item.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Response time history */}
        {history.length > 0 && (
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Response History
              </div>
              <span className="text-xs text-muted-foreground">{history.length} checks</span>
            </div>
            <div className="flex items-end gap-0.5 h-10">
              {history.slice(0, 60).reverse().map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-all ${
                    h.status === "OK" ? "bg-emerald-500" : "bg-red-500"
                  }`}
                  style={{ height: `${Math.max(15, Math.min(100, (h.responseTime / 500) * 100))}%` }}
                  title={`${h.responseTime}ms`}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>oldest</span>
              <span>latest</span>
            </div>
          </div>
        )}

        <div className="text-center mt-6 text-xs text-muted-foreground">
          Health checks every 30s · Stats refresh every 5 minutes
        </div>

      </div>
    </div>
  )
}
