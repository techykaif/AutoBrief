import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Use | AutoBrief",
  description: "Terms of use for AutoBrief — automated news aggregation platform.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-foreground mb-2">Terms of Use</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using AutoBrief ("the Platform"), you agree to be bound by these Terms
              of Use. If you do not agree, please discontinue use immediately. AutoBrief reserves the
              right to update these terms at any time without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. Nature of the Platform</h2>
            <p>
              AutoBrief is a non-profit, automated news aggregation platform. It collects publicly
              available content from RSS feeds and uses artificial intelligence to summarise and
              rewrite articles for informational purposes only. AutoBrief does not produce original
              journalism and is not a news organisation.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. Content Disclaimer</h2>
            <p>
              All articles published on AutoBrief are AI-generated summaries of publicly available
              news content. While we strive for accuracy, AutoBrief makes no representations or
              warranties regarding the completeness, accuracy, or timeliness of any content. Users
              should independently verify any information before relying on it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Intellectual Property</h2>
            <p>
              AutoBrief does not claim ownership of the original news articles from which summaries
              are derived. Original content belongs to its respective publishers. AI-generated
              summaries are transformative works intended for informational, non-commercial purposes
              under fair use principles. If you are a content owner and believe your rights have been
              infringed, please refer to our DMCA policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. No Commercial Use</h2>
            <p>
              You may not reproduce, distribute, or commercially exploit content from AutoBrief
              without explicit written permission. Personal, non-commercial use and sharing of links
              is permitted.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Limitation of Liability</h2>
            <p>
              AutoBrief and its creator shall not be liable for any direct, indirect, incidental,
              or consequential damages arising from your use of the platform, including reliance on
              any content published. Use of this platform is entirely at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Third-Party Links</h2>
            <p>
              Articles on AutoBrief may reference or link to third-party websites. AutoBrief has no
              control over and assumes no responsibility for the content, privacy policies, or
              practices of any third-party sites.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with applicable laws.
              AutoBrief operates as a personal non-profit project and is not incorporated as a
              legal entity.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">9. Contact</h2>
            <p>
              For any questions regarding these terms, please contact us through the GitHub repository
              at{" "}
              <a
                href="https://github.com/techykaif/autobrief"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/techykaif/autobrief
              </a>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
