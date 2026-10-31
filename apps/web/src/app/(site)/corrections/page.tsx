import type { Metadata } from "next";
import Link from "next/link";
import { correctionsEmail } from "@/lib/site";
import { ContactLine, ProsePage } from "../_shared/prose-page";

export const metadata: Metadata = {
  title: "Corrections",
  description: "How to report an error in a Daily Circuit article and how we correct it.",
  alternates: { canonical: "/corrections" },
};

export default function CorrectionsPage() {
  return (
    <ProsePage title="Corrections and grievances" lede="If we got something wrong, tell us. We will fix it and say what changed." updated="1 November 2026">
      <h2>Report an error</h2>
      <p>
        Send the article link, what is wrong, and a source showing the correct information to{" "}
        <ContactLine email={correctionsEmail()} fallback={<Link href="/contact">our contact form</Link>} /> (choose &ldquo;Correction&rdquo; as the topic on the form).
      </p>
      <h2>What we do</h2>
      <ul>
        <li>We review every correction request against the original sources, normally within two working days.</li>
        <li>If the article is wrong, we fix the text, show an &ldquo;Updated&rdquo; time, and describe the correction at the end of the article.</li>
        <li>If an article cannot be corrected reliably, we withdraw it and say so on the page.</li>
      </ul>
      <h2>Grievances</h2>
      <p>
        Complaints about our content, including under India&apos;s Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, can be sent to the same address. We acknowledge each grievance and aim to resolve it within 15 days.
      </p>
    </ProsePage>
  );
}
