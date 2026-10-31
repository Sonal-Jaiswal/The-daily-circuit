import { buildCover, COVER_H, COVER_W, type CoverSection } from "@/lib/cover";
import { cn } from "@/lib/utils";

/** Inline generative cover. Decorative unless `alt` is given. */
export function Cover({ seed, section, alt, className, priority }: { seed: string; section: CoverSection; alt?: string; className?: string; priority?: boolean }) {
  const { palette, traces } = buildCover(seed, section);
  return (
    <svg
      viewBox={`0 0 ${COVER_W} ${COVER_H}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("block h-full w-full", className)}
      role={alt ? "img" : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
      data-priority={priority ? "true" : undefined}
    >
      <rect width={COVER_W} height={COVER_H} fill={palette.field} />
      {traces.map((t, i) => {
        const stroke = t.accent ? palette.accent : palette.trace;
        return (
          <g key={i}>
            <path d={t.d} fill="none" stroke={stroke} strokeWidth={t.width} strokeLinecap="round" strokeLinejoin="round" opacity={t.accent ? 1 : t.opacity} />
            <circle cx={t.start.x} cy={t.start.y} r={t.width + 2} fill={palette.field} stroke={stroke} strokeWidth={3} />
            <circle cx={t.end.x} cy={t.end.y} r={t.width + 5} fill={t.accent ? palette.accent : palette.pad} />
          </g>
        );
      })}
    </svg>
  );
}

/** Licensed image when an editor attached one, otherwise the generative cover. */
export function ArticleVisual({
  seed,
  section,
  alt,
  imageUrl,
  imageCredit,
  className,
}: {
  seed: string;
  section: CoverSection;
  alt: string;
  imageUrl?: string | null;
  imageCredit?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <figure className={className}>
        {/* Licensed third-party image chosen by an editor; served as-is with its credit. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={alt} className="h-full w-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {imageCredit && <figcaption className="mt-2 text-xs text-ink-3">{imageCredit}</figcaption>}
      </figure>
    );
  }
  return <Cover seed={seed} section={section} alt={alt} className={className} />;
}
