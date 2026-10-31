import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/forms";
import { contactEmail } from "@/lib/site";
import { ProsePage } from "../_shared/prose-page";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact The Daily Circuit about corrections, grievances, privacy requests or advertising.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const email = contactEmail();
  return (
    <ProsePage title="Contact" lede="Questions, corrections, grievances and privacy requests all come to the same inbox and are read by a person.">
      <p>
        For corrections, include the article link and a source for the correct information. See <Link href="/corrections">corrections</Link> for how we handle them.
        {email && (
          <>
            {" "}
            You can also email <a href={`mailto:${email}`}>{email}</a>.
          </>
        )}
      </p>
      <div className="not-prose mt-6 font-sans">
        <ContactForm />
      </div>
    </ProsePage>
  );
}
