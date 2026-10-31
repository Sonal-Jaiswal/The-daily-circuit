import { ConsentAndAnalytics } from "@/components/client";
import { JsonLd, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getPublicSettings } from "@/lib/data";
import { SITE, siteUrl } from "@/lib/site";
import { organizationJsonLd, websiteJsonLd } from "@tdc/core/seo/jsonld";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPublicSettings();
  const identity = { name: SITE.name, url: siteUrl(), description: SITE.description, logoUrl: `${siteUrl()}/logo.png` };
  return (
    <>
      <JsonLd data={[organizationJsonLd(identity), websiteJsonLd(identity)]} />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <ConsentAndAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null} adsenseClient={settings.ads.enabled && settings.ads.publisherId ? `ca-${settings.ads.publisherId}` : null} />
    </>
  );
}
