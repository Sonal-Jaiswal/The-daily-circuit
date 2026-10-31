import { ArticlePage, articleMetadata, articleStaticParams } from "../../_shared/article-page";

// Every article is fully static: unknown slugs render on first request, then are cached.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return articleStaticParams("IPO");
}

export async function generateMetadata({ params }: PageProps<"/ipo/[slug]">) {
  const { slug } = await params;
  return articleMetadata("IPO", slug);
}

export default async function Page({ params }: PageProps<"/ipo/[slug]">) {
  const { slug } = await params;
  return <ArticlePage section="IPO" slug={slug} />;
}
