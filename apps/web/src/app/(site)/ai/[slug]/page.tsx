import { ArticlePage, articleMetadata, articleStaticParams } from "../../_shared/article-page";

// Every article is fully static: unknown slugs render on first request, then are cached.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return articleStaticParams("AI");
}

export async function generateMetadata({ params }: PageProps<"/ai/[slug]">) {
  const { slug } = await params;
  return articleMetadata("AI", slug);
}

export default async function Page({ params }: PageProps<"/ai/[slug]">) {
  const { slug } = await params;
  return <ArticlePage section="AI" slug={slug} />;
}
