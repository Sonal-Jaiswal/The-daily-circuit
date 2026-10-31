import { ArticlePage, articleMetadata, articleStaticParams } from "../../_shared/article-page";

// Every article is fully static: unknown slugs render on first request, then are cached.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return articleStaticParams("TECHNOLOGY");
}

export async function generateMetadata({ params }: PageProps<"/technology/[slug]">) {
  const { slug } = await params;
  return articleMetadata("TECHNOLOGY", slug);
}

export default async function Page({ params }: PageProps<"/technology/[slug]">) {
  const { slug } = await params;
  return <ArticlePage section="TECHNOLOGY" slug={slug} />;
}
