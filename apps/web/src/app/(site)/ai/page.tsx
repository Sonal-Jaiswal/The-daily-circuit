import { SectionPage, sectionMetadata } from "../_shared/section-page";

export function generateMetadata() {
  return sectionMetadata("AI");
}

export default function Page() {
  return <SectionPage section="AI" />;
}
