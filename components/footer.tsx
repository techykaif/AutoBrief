import Link from "next/link"
import Image from "next/image"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border mt-auto bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Image 
                src="/logo.png" 
                alt="AutoBrief Logo" 
                width={32} 
                height={32} 
                className="w-8 h-8 object-contain" 
              />
              <span className="text-xl font-bold text-foreground">AutoBrief</span>
            </Link>

            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              A free, ad-free automated news platform. Articles are AI-summarised
              from public RSS feeds for informational purposes only.
            </p>

            <p className="text-xs text-muted-foreground mt-3">
              Non-profit project by{" "}
              <span className="font-medium text-foreground">Mohd Kaif Ansari</span>
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-semibold text-foreground mb-4 text-sm">Navigate</h3>
            <ul className="space-y-2.5">
              {[
                { href: "/", label: "Home" },
                { href: "/categories", label: "Categories" },
                { href: "/about", label: "About" },
                { href: "/status", label: "Status" },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-foreground mb-4 text-sm">Legal</h3>
            <ul className="space-y-2.5">
              {[
                { href: "/terms", label: "Terms of Use" },
                { href: "/privacy", label: "Privacy Policy" },
                { href: "/disclaimer", label: "Disclaimer" },
                { href: "/dmca", label: "DMCA / Copyright" },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="border-t border-border mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {currentYear} AutoBrief. All content is sourced from public RSS feeds and summarised by AI.
          </p>
          <p className="text-xs text-muted-foreground">
            Not affiliated with any news organisation.
          </p>
        </div>
      </div>
    </footer>
  )
}
