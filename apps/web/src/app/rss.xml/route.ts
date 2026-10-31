import { articlePath, sectionInfo } from "@tdc/core/content/paths";
import { buildRss } from "@tdc/core/seo/xml";
import { getFeedArticles } from "@/lib/data";
import { absoluteUrl, SITE } from "@/lib/site";

export async function GET() {
  const articles = (await getFeedArticles(50)).filter((a) => a.publishedAt);
  const xml = buildRss(
    { title: SITE.name, link: absoluteUrl("/"), description: SITE.description, selfUrl: absoluteUrl("/rss.xml") },
    articles.map((a) => ({
      title: a.headline,
      link: absoluteUrl(articlePath(a)),
      description: a.excerpt,
      publishedAt: a.publishedAt!,
      category: sectionInfo(a.section).name,
      author: a.author.name,
    })),
  );
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
