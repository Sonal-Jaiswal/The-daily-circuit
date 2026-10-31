import { SectionPage, sectionMetadata } from "../_shared/section-page";

export function generateMetadata() {
  return sectionMetadata("TECHNOLOGY");
}

export default function Page() {
  return <SectionPage section="TECHNOLOGY" />;
}
