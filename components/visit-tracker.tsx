"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export function VisitTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // Don't track status page - it has its own logic
    if (pathname === "/status") return

    const key = "ab_last_track"
    const last = localStorage.getItem(key)
    const now = Date.now()

    if (!last || now - parseInt(last) > 5 * 60 * 1000) {
      fetch("/api/track", { method: "POST" }).catch(() => {})
      localStorage.setItem(key, String(now))
    }
  }, [pathname])

  return null
}
