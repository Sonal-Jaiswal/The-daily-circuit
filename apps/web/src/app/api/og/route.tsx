import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { Section } from "@tdc/db";
import { sectionInfo } from "@tdc/core/content/paths";
import { coverSvg } from "@/lib/cover";
import { getArticle } from "@/lib/data";
import { SITE } from "@/lib/site";

const SECTIONS = new Set<Section>(["AI", "TECHNOLOGY", "MARKETS", "IPO"]);

/** Open Graph card: the article's generative cover with its headline. */
export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get("section") as Section | null;
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!section || !SECTIONS.has(section) || !/^[a-z0-9-]{1,120}$/.test(slug)) return new Response("Not found", { status: 404 });
  const article = await getArticle(section, slug);
  if (!article) return new Response("Not found", { status: 404 });
  const cover = `data:image/svg+xml;base64,${Buffer.from(coverSvg(slug, section)).toString("base64")}`;
  const markets = sectionInfo(section).desk === "MARKETS";
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#161a33" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} width={1200} height={630} alt="" style={{ position: "absolute", inset: 0, opacity: 0.55 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "64px 72px", width: "100%", background: "linear-gradient(180deg, rgba(22,26,51,0) 20%, rgba(22,26,51,0.92) 70%)" }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: markets ? "#f2c766" : "#a3acf7" }}>{sectionInfo(section).name}</div>
          <div style={{ display: "flex", marginTop: 16, fontSize: article.headline.length > 90 ? 50 : 60, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, color: "#ffffff" }}>{article.headline}</div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 26, color: "#c9cef2" }}>{SITE.name}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  image.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  return image;
}
