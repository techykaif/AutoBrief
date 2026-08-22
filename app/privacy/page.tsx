import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy | AutoBrief",
  description: "Privacy policy for AutoBrief — what data we collect and how we use it.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Overview</h2>
            <p>
              AutoBrief is a non-profit, ad-free platform. We are committed to protecting your
              privacy. This policy explains what minimal data we collect and why.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. Data We Collect</h2>
            <p className="mb-3">AutoBrief collects very minimal data:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-foreground font-medium">Visit count:</span> We count total
                site visits as an aggregate number (not per-user) stored in Google Sheets. No
                personal data, IP address, or browser fingerprint is stored.
              </li>
              <li>
                <span className="text-foreground font-medium">Browser localStorage:</span> We store
                a timestamp in your browser's localStorage to avoid counting the same visit multiple
                times within 5 minutes. This data never leaves your device.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. What We Do NOT Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>No personal information (name, email, phone)</li>
              <li>No IP addresses or device identifiers</li>
              <li>No cookies</li>
              <li>No tracking pixels or advertising tags</li>
              <li>No user accounts or registration data</li>
              <li>No payment information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Third-Party Services</h2>
            <p className="mb-2">AutoBrief uses the following third-party infrastructure:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-foreground font-medium">Vercel:</span> Hosts the website.
                Vercel may collect standard server logs including IP addresses as part of their
                infrastructure. See{" "}
                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Vercel's Privacy Policy
                </a>.
              </li>
              <li>
                <span className="text-foreground font-medium">Google Sheets API:</span> Used as
                the data pipeline backend. No user data is stored here — only article content and
                aggregate visit counts.
              </li>
              <li>
                <span className="text-foreground font-medium">Groq API:</span> Used to generate
                AI article summaries. Article content (not user data) is sent to Groq for processing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. Children's Privacy</h2>
            <p>
              AutoBrief does not knowingly collect any information from children under 13. The
              platform is a general news aggregator suitable for all ages.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Continued use of the platform after
              changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Contact</h2>
            <p>
              For privacy-related questions, contact us via{" "}
              <a
                href="https://github.com/techykaif/news_automation_website"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
