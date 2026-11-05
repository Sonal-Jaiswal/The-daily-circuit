#!/usr/bin/env python3
"""Makes one YouTube Short from the newest story without one, and uploads it.

  python run.py                      pick a story, render, upload
  python run.py --dry-run            render only; the video lands in output/<slug>/
  python run.py --url <article-url>  use a specific article
  python run.py --privacy private    upload without making it public
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

from shorts import images, render, script, source, voice, youtube
from shorts.config import OUTPUT_DIR, env, load_dotenv

OUTRO = "The full story is on A.I. blog dot fun."


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="render but do not upload")
    parser.add_argument("--url", help="article URL to use instead of choosing one")
    parser.add_argument("--privacy", choices=["public", "unlisted", "private"], default="public")
    args = parser.parse_args()
    load_dotenv()

    if not args.dry_run and not youtube.has_credentials():
        print("No YouTube credentials found. Run auth.py first, or pass --dry-run.", file=sys.stderr)
        return 2

    started = time.time()
    token = youtube.access_token() if youtube.has_credentials() else None
    done = youtube.uploaded_article_urls(token) if token else []

    feed = source.fetch_feed()
    if args.url:
        desk = "markets" if "/markets/" in args.url or "/ipo/" in args.url else "ai"
        article = source.fetch_article(args.url, desk)
    else:
        item = script.most_watchable(source.candidates(feed, done, int(env("MAX_ARTICLE_AGE_HOURS", "72"))))
        if not item:
            print("Nothing new: every recent story already has a Short.")
            return 0
        article = source.fetch_article(item.url, item.desk)
    print(f"Story: {article.title}\n  {article.url}")

    written = script.write_script(article)
    print(f"Script by {written.author}: {sum(len(s.narration.split()) for s in written.scenes)} words, {len(written.scenes)} scenes")
    pictures, made_by = images.scene_images([s.image_subject for s in written.scenes], article)
    print(f"Images: {made_by}")

    out_dir = OUTPUT_DIR / article.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    video = out_dir / "short.mp4"
    with tempfile.TemporaryDirectory() as work:
        audio, spoken, voiced_by = voice.narrate([s.narration for s in written.scenes] + [OUTRO], Path(work))
        print(f"Voice: {voiced_by}, {spoken[-1].end:.1f} seconds. Rendering...")
        render.render_video(pictures, spoken, audio, written.headline, [s.banner for s in written.scenes], source.ticker_headlines(feed, article), article.desk, video)

    metadata = youtube.build_metadata(article, args.privacy, written.headline)
    (out_dir / "metadata.json").write_text(
        json.dumps({"youtube": metadata, "script_by": written.author, "images_by": made_by, "voice": voiced_by, "headline": written.headline, "banners": [s.banner for s in written.scenes], "narration": [s.narration for s in written.scenes]}, indent=2, ensure_ascii=False)
    )
    print(f"Rendered {video} ({video.stat().st_size / 1e6:.1f} MB) in {time.time() - started:.0f}s")

    if args.dry_run:
        print("Dry run: not uploaded.")
        return 0
    # The render takes minutes at most, well inside the token's hour of life.
    video_id = youtube.upload(video, metadata, token)
    print(f"Uploaded ({args.privacy}): https://www.youtube.com/shorts/{video_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
