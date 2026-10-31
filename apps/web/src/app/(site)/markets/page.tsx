import { SectionPage, sectionMetadata } from "../_shared/section-page";

export function generateMetadata() {
  return sectionMetadata("MARKETS");
}

export default function Page() {
  return <SectionPage section="MARKETS" />;
}
