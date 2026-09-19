import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "DMCA & Copyright Policy | AutoBrief",
  description: "DMCA takedown and copyright policy for AutoBrief.",
  alternates: { canonical: "/dmca" },
}

export default function DmcaPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-foreground mb-2">DMCA & Copyright Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">Our Approach to Copyright</h2>
            <p>
              AutoBrief respects the intellectual property rights of content creators and news
              organisations. All content on AutoBrief consists of AI-generated summaries of publicly
              available RSS feed content. We do not reproduce full articles verbatim. Summaries are
              transformative works intended for non-commercial, informational purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">Fair Use</h2>
            <p>
              AutoBrief operates under fair use principles (17 U.S.C. § 107) as our content is:
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Transformative — rewritten by AI, not reproduced verbatim</li>
              <li>Non-commercial — AutoBrief carries no advertising and generates no revenue</li>
              <li>Informational — for public benefit and education</li>
              <li>Attribution-respecting — source publications are credited</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">DMCA Takedown Requests</h2>
            <p className="mb-3">
              If you are a copyright owner and believe content on AutoBrief infringes your rights,
              please submit a takedown request containing the following:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your full name and contact information</li>
              <li>A description of the copyrighted work you claim has been infringed</li>
              <li>The specific URL(s) on AutoBrief where the alleged infringing content appears</li>
              <li>A statement that you have a good faith belief the use is not authorised</li>
              <li>A statement that the information is accurate and, under penalty of perjury, that you are the copyright owner or authorised to act on their behalf</li>
              <li>Your electronic or physical signature</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">How to Submit</h2>
            <p>
              Submit DMCA takedown requests via GitHub Issues at{" "}
              <a
                href="https://github.com/techykaif/news_automation_website/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/techykaif/news_automation_website/issues
              </a>{" "}
              with the title "DMCA Takedown Request". We aim to respond within 5 business days
              and will remove content promptly if a valid claim is established.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">Counter-Notices</h2>
            <p>
              If you believe content was removed in error, you may submit a counter-notice via the
              same GitHub Issues channel. Counter-notices must include your contact information,
              identification of the removed content, and a statement under penalty of perjury that
              you have a good faith belief the content was removed by mistake.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">Opt-Out for Publishers</h2>
            <p>
              If you are a publisher and wish to have your RSS feed removed from AutoBrief's
              sources entirely, please open a GitHub Issue with the title "RSS Feed Opt-Out" and
              include your feed URL. We will remove it from our sources within 5 business days.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
