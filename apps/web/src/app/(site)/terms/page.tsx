import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "../_shared/prose-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that apply when you use The Daily Circuit.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" updated="1 November 2026">
      <h2>Using the site</h2>
      <p>You may read, share links to and quote short extracts from our articles with attribution and a link. Do not republish full articles, or scrape the site at a rate that degrades it for others.</p>
      <h2>Accuracy</h2>
      <p>
        Articles are produced by an automated system and checked by software and, where flagged, by editors. We work to be accurate but cannot guarantee that every article is complete or error-free. Read the <Link href="/editorial-policy">editorial policy</Link> and the <Link href="/disclaimer">financial disclaimer</Link>.
      </p>
      <h2>Third-party content</h2>
      <p>We link to the original sources of every story. Those sites have their own terms and we are not responsible for their content.</p>
      <h2>Intellectual property</h2>
      <p>Our articles, illustrations and site design are ours. Source material belongs to its owners and is linked, not reproduced.</p>
      <h2>Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India.</p>
    </ProsePage>
  );
}
