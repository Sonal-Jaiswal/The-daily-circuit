import type { Metadata } from "next";
import Link from "next/link";
import { aiModelsLabel } from "@/lib/site";
import { ProsePage } from "../_shared/prose-page";

export const metadata: Metadata = {
  title: "Editorial policy",
  description: "How The Daily Circuit selects, writes, verifies and corrects its automated news coverage of AI and Indian markets.",
  alternates: { canonical: "/editorial-policy" },
};

export default function EditorialPolicyPage() {
  return (
    <ProsePage title="Editorial policy" lede="How stories are chosen, written and checked, and what we will never do." updated="1 November 2026">
      <h2>Automated production, disclosed</h2>
      <p>
        Articles are researched and drafted by an automated system built on {aiModelsLabel()}. Each article says so in its byline and in a note at the end. We never invent bylines, describe the system as a human reporter, or claim to have interviewed anyone or witnessed anything.
      </p>

      <h2>Sources</h2>
      <p>We collect stories only from sources we are permitted to use:</p>
      <ul>
        <li>Official announcements: company newsrooms and blogs, the Reserve Bank of India, SEBI, and stock exchanges where access is permitted.</li>
        <li>Publishers&apos; public RSS feeds, used only as a signal that something happened. We use the headline and the summary the publisher provides, link to the original, and write our own article from the facts.</li>
        <li>Licensed data providers, for market prices, and only when our licence permits public display.</li>
      </ul>
      <p>
        Our collector identifies itself as TheDailyCircuitBot, follows each site&apos;s robots.txt, respects rate limits, and never bypasses paywalls or logins. Source pages are read only to check facts. They are not republished.
      </p>

      <h2>Selection</h2>
      <p>Candidate stories are deduplicated and grouped by event, then scored:</p>
      <ul>
        <li>Importance: 30%</li>
        <li>Source credibility: 25% (official and original sources rank highest; independent corroboration adds weight)</li>
        <li>Freshness: 20% (stories older than 30 hours are excluded)</li>
        <li>Industry impact: 15%</li>
        <li>Reader interest: 10%</li>
      </ul>
      <p>
        We publish at most one article per event and at most ten per desk each day. A story whose publication time cannot be verified is not selected. If fewer than ten stories score high enough, we publish fewer.
      </p>

      <h2>Writing standards</h2>
      <ul>
        <li>Every factual claim is cited to a numbered source, next to the claim.</li>
        <li>Quotations are used only when they appear word for word in a source, with attribution.</li>
        <li>Numbers, dates and prices are used exactly as the sources state them. We do not estimate or invent statistics.</li>
        <li>Confirmed facts are kept separate from reports, plans and speculation. Analysis is labelled as AI-generated analysis.</li>
        <li>Headlines are factual. No clickbait, no question headlines.</li>
        <li>Articles are written in our own words. We do not copy source articles.</li>
      </ul>

      <h2>Automated checks before publication</h2>
      <p>Every draft is checked by software before it can be published. A draft is blocked if it:</p>
      <ul>
        <li>cites a source that was not supplied, or contains any URL not from our source list;</li>
        <li>contains a quotation that does not appear in a source;</li>
        <li>is too short to be useful, or has a clickbait headline.</li>
      </ul>
      <p>
        A draft is held for a human editor if a second model&apos;s fact-check flags a claim, if figures cannot be found in the sources, or if the wording could read as investment advice. Drafts that fail are never published automatically.
      </p>

      <h2>Indian markets coverage</h2>
      <p>
        Market articles report facts, historical performance and clearly attributed third-party views. They never tell readers to buy, sell, hold, subscribe to or avoid a security or IPO. A rising price is never described as evidence of a good investment. When a stock moves sharply, our &ldquo;Why is this stock moving?&rdquo; reports give a reason only if a company, exchange or regulator disclosure states one. See the <Link href="/disclaimer">financial disclaimer</Link>.
      </p>

      <h2>Images</h2>
      <p>
        Article illustrations are generated from each article&apos;s address and are original to us. Third-party images are used only when an editor has confirmed the licence, and are credited.
      </p>

      <h2>Corrections</h2>
      <p>
        We correct errors promptly and say what changed. Updated articles show an &ldquo;Updated&rdquo; time. See <Link href="/corrections">corrections</Link> to report an error.
      </p>
    </ProsePage>
  );
}
