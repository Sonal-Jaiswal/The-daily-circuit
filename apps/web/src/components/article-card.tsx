import Link from "next/link";
import { articlePath, sectionInfo } from "@tdc/core/content/paths";
import { formatIstDateTime } from "@tdc/core/time/ist";
import type { ArticleCard as Card } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";

export function SectionLabel({ section, className }: { section: Card["section"]; className?: string }) {
  const info = sectionInfo(section);
  const markets = info.desk === "MARKETS";
  return (
    <Link
      href={`/${info.slug}`}
      className={cn("text-[0.8125rem] font-semibold hover:underline", markets ? "text-marigold-ink" : "text-neel", className)}
    >
      {info.name}
    </Link>
  );
}

export function Meta({ article, className }: { article: Pick<Card, "publishedAt" | "readingTimeMinutes">; className?: string }) {
  return (
    <p className={cn("text-[0.8125rem] text-ink-3", className)}>
      <time dateTime={article.publishedAt.toISOString()}>{formatIstDateTime(article.publishedAt)}</time>
      <span aria-hidden="true"> / </span>
      {article.readingTimeMinutes} min read
    </p>
  );
}

/** Headline-first list item with a small cover — the workhorse of section and desk lists. */
export function StoryRow({ article, showSection = true }: { article: Card; showSection?: boolean }) {
  return (
    <article className="group grid grid-cols-[1fr_96px] gap-4 py-5 sm:grid-cols-[1fr_132px]">
      <div className="min-w-0">
        {showSection && <SectionLabel section={article.section} />}
        <h3 className="mt-1 text-lg font-bold leading-snug tracking-[-0.01em] text-ink">
          <Link href={articlePath(article)} className="hover:text-neel">
            {article.headline}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 font-serif text-[1.02rem] leading-normal text-ink-2">{article.excerpt}</p>
        <Meta article={article} className="mt-2" />
      </div>
      <Link href={articlePath(article)} tabIndex={-1} aria-hidden="true" className="block aspect-[4/3] overflow-hidden rounded-md">
        <Cover seed={article.slug} section={article.section} />
      </Link>
    </article>
  );
}

/** Larger card for grids. */
export function StoryCard({ article }: { article: Card }) {
  return (
    <article className="flex flex-col">
      <Link href={articlePath(article)} tabIndex={-1} aria-hidden="true" className="block aspect-[1.9/1] overflow-hidden rounded-md">
        <Cover seed={article.slug} section={article.section} />
      </Link>
      <SectionLabel section={article.section} className="mt-3" />
      <h3 className="mt-1 text-[1.15rem] font-bold leading-snug tracking-[-0.01em]">
        <Link href={articlePath(article)} className="hover:text-neel">
          {article.headline}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-3 font-serif text-[1.02rem] leading-normal text-ink-2">{article.excerpt}</p>
      <Meta article={article} className="mt-2" />
    </article>
  );
}
