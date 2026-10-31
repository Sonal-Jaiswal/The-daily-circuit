import { SectionPage, sectionMetadata } from "../_shared/section-page";

export function generateMetadata() {
  return sectionMetadata("IPO");
}

export default function Page() {
  return <SectionPage section="IPO" />;
}
