import { ArticlePage, articleMetadata, articleStaticParams } from "../../_shared/article-page";

// Every article is fully static: unknown slugs render on first request, then are cached.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return articleStaticParams("MARKETS");
}

export async function generateMetadata({ params }: PageProps<"/markets/[slug]">) {
  const { slug } = await params;
  return articleMetadata("MARKETS", slug);
}

export default async function Page({ params }: PageProps<"/markets/[slug]">) {
  const { slug } = await params;
  return <ArticlePage section="MARKETS" slug={slug} />;
}
