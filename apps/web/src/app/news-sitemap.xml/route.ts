import { cacheLife, cacheTag } from "next/cache";
import { articlePath } from "@tdc/core/content/paths";
import { buildNewsSitemap } from "@tdc/core/seo/xml";
import { CONTENT_TAG, getFeedArticles } from "@/lib/data";
import { absoluteUrl, SITE } from "@/lib/site";

async function render() {
  "use cache";
  // The 48-hour window moves with time, so this entry refreshes hourly as well as on publish.
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const articles = await getFeedArticles(1000);
  return buildNewsSitemap(
    articles.filter((a) => a.publishedAt).map((a) => ({ loc: absoluteUrl(articlePath(a)), title: a.headline, publishedAt: a.publishedAt! })),
    SITE.name,
    new Date(),
  );
}

/** Google News sitemap: articles from the last 48 hours only. */
export async function GET() {
  return new Response(await render(), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
