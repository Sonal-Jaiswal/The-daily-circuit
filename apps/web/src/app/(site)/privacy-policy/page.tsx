import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail } from "@/lib/site";
import { ContactLine, ProsePage } from "../_shared/prose-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal data The Daily Circuit collects, why, and your rights.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" lede="We collect as little personal data as we can, and only for the purposes below." updated="1 November 2026">
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Newsletter subscribers:</strong> your email address, the time you subscribed and confirmed, and the consent wording you agreed to. We use it only to send the evening edition and service messages about your subscription.
        </li>
        <li>
          <strong>Contact form:</strong> your name, email address and message, used to reply to you.
        </li>
        <li>
          <strong>Reading statistics:</strong> when you open an article we count one view for that article and day. The count does not include who you are, your IP address or any identifier.
        </li>
        <li>
          <strong>Security logs:</strong> our hosting providers process IP addresses to deliver the site and protect it from abuse. Where we store an IP address for rate limiting or security, we store a keyed one-way hash, not the address itself.
        </li>
      </ul>
      <h2>Cookies</h2>
      <p>
        We set no tracking cookies by default. Editors who sign in to our dashboard receive a strictly necessary session cookie. If we enable Google Analytics or Google AdSense, they load only after you choose &ldquo;Allow cookies&rdquo; in the banner. We use Google Consent Mode, so these services treat you as not consenting until you do. You can change your choice by clearing this site&apos;s data in your browser.
      </p>
      <h2>Service providers</h2>
      <p>
        We use hosting, database, email delivery and, if enabled, analytics and advertising providers. They process data on our behalf under their terms. Article drafting sends public news source material, not reader data, to Anthropic&apos;s API.
      </p>
      <h2>Retention</h2>
      <p>
        Subscriber data is kept until you unsubscribe and is then deleted or anonymised within 30 days, except for a record of the unsubscribe so that we do not email you again. Contact messages are kept for up to 12 months.
      </p>
      <h2>Your rights</h2>
      <p>
        Under India&apos;s Digital Personal Data Protection Act, 2023 and other applicable law, you can ask to access, correct or erase your personal data, withdraw consent, and raise a grievance. Every newsletter email has an unsubscribe link. For other requests contact <ContactLine email={contactEmail()} fallback={<Link href="/contact">us through the contact page</Link>} />.
      </p>
    </ProsePage>
  );
}
