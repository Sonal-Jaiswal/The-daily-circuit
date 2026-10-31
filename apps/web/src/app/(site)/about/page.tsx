import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "../_shared/prose-page";

export const metadata: Metadata = {
  title: "About",
  description: "The Daily Circuit is an automated evening edition covering artificial intelligence and Indian financial markets, with every story linked to its sources.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ProsePage title="About The Daily Circuit" lede="An evening edition for people who follow artificial intelligence and Indian markets, and want the day's important developments in one place, with the sources attached.">
      <h2>What we publish</h2>
      <p>
        Every evening at 9:00 pm IST we publish up to ten stories about artificial intelligence and technology and up to ten about Indian markets, covering the previous 24 hours. If fewer stories meet our standard, we publish fewer. We do not fill a quota.
      </p>
      <h2>How it works</h2>
      <p>
        The Daily Circuit is an automated newsroom. Software collects announcements from official sources (company newsrooms, the Reserve Bank of India, SEBI) and from technology publications. It removes duplicates, groups reports of the same event and ranks them by importance, source credibility, freshness, impact and likely reader interest.
      </p>
      <p>
        For each selected story, Anthropic&apos;s Claude models draft an original article using only the sources we collected. The draft then goes through automated checks: every citation must point to a real source, quotations must appear word for word in a source, and figures must match the sources. Anything that fails, or that could read as investment advice, is held for a human editor instead of being published.
      </p>
      <p>
        Articles carry an automated-desk byline and say plainly that they were produced by an AI system. We never present them as the work of a human reporter. Read the full <Link href="/editorial-policy">editorial policy</Link>.
      </p>
      <h2>What we are not</h2>
      <p>
        We are not an investment adviser, research analyst or broker, and nothing we publish is a recommendation to buy, sell or hold any security. See the <Link href="/disclaimer">financial disclaimer</Link>.
      </p>
      <h2>Contact</h2>
      <p>
        To report an error, see <Link href="/corrections">corrections</Link>. For anything else, use the <Link href="/contact">contact page</Link>.
      </p>
    </ProsePage>
  );
}
