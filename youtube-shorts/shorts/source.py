"""Reads published stories from the site: the RSS feed for the list, the article page for the text."""
from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

import requests

from .config import USER_AGENT, site_url

MARKET_CATEGORIES = {"Indian Markets", "IPO"}
# Fine for the archive, but nobody wants to watch them: data releases and administrative notices.
ROUTINE = re.compile(r"money market operations|treasury bills?|\bt-bills?\b|auction results?|\bRTI\b|inspection findings|cancels? registrations?", re.I)


@dataclass
class FeedItem:
    title: str
    url: str
    category: str
    published: datetime

    @property
    def desk(self) -> str:
        return "markets" if self.category in MARKET_CATEGORIES else "ai"


@dataclass
class Article:
    title: str
    url: str
    summary: str
    desk: str
    keywords: list[str] = field(default_factory=list)
    key_facts: list[str] = field(default_factory=list)
    paragraphs: list[str] = field(default_factory=list)
    hero_url: str | None = None

    @property
    def corpus(self) -> str:
        return " ".join([self.title, self.summary, *self.keywords, *self.key_facts, *self.paragraphs])

    @property
    def slug(self) -> str:
        return self.url.rstrip("/").rsplit("/", 1)[-1]


def clean_text(raw: str) -> str:
    """Strips markup and citation markers, and normalises characters the voice and font trip over."""
    text = re.sub(r'<a [^>]*class="cite"[^>]*>.*?</a>', "", raw, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = text.replace("‑", "-").replace("‐", "-").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def _get(url: str) -> requests.Response:
    res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    res.raise_for_status()
    return res


def parse_feed(xml_text: str) -> list[FeedItem]:
    items = []
    for node in ET.fromstring(xml_text).iter("item"):
        items.append(
            FeedItem(
                title=clean_text(node.findtext("title", "")),
                url=node.findtext("link", "").strip(),
                category=node.findtext("category", "").strip(),
                published=parsedate_to_datetime(node.findtext("pubDate", "")),
            )
        )
    return items


def fetch_feed() -> list[FeedItem]:
    return parse_feed(_get(f"{site_url()}/rss.xml").text)


def choose_item(items: list[FeedItem], done_urls: list[str], max_age_hours: int, now: datetime | None = None) -> FeedItem | None:
    """Newest story worth watching without a Short, preferring the desk that did not get the last one.

    `done_urls` is ordered newest upload first.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=max_age_hours)
    done = {_norm(u) for u in done_urls}
    fresh = [i for i in items if i.published >= cutoff and _norm(i.url) not in done and not ROUTINE.search(i.title)]
    if not fresh:
        return None
    last_desk = None
    if done_urls:
        last_desk = "markets" if "/markets/" in done_urls[0] or "/ipo/" in done_urls[0] else "ai"
    fresh.sort(key=lambda i: i.published, reverse=True)
    return next((i for i in fresh if i.desk != last_desk), fresh[0])


def _norm(url: str) -> str:
    return url.rstrip("/").lower()


def parse_article(page: str, url: str, desk: str) -> Article:
    meta: dict = {}
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for entry in data if isinstance(data, list) else [data]:
            if entry.get("@type") == "NewsArticle":
                meta = entry
    if not meta:
        raise ValueError(f"No NewsArticle data found on {url}")

    # Only an image before the key facts belongs to this story; later ones are related articles.
    facts_at = page.find('id="key-facts"')
    head = page[: facts_at if facts_at > 0 else page.find("prose-article")]
    hero = re.search(r'<img [^>]*src="(/api/images/[^"]+)"', head)

    facts: list[str] = []
    section = re.search(r'id="key-facts".*?</section>', page, re.S)
    if section:
        facts = [clean_text(li) for li in re.findall(r"<li[^>]*>(.*?)</li>", section.group(0), re.S)]

    paragraphs: list[str] = []
    body = re.search(r'class="prose-article">(.*?)</div></div>', page, re.S)
    if body:
        paragraphs = [clean_text(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", body.group(1), re.S)]

    return Article(
        title=clean_text(meta.get("headline", "")),
        url=url,
        summary=clean_text(meta.get("description", "")),
        desk=desk,
        keywords=[k.strip() for k in meta.get("keywords", "").split(",") if k.strip()],
        key_facts=[f for f in facts if f],
        paragraphs=[p for p in paragraphs if p],
        hero_url=urljoin(url, hero.group(1)) if hero else None,
    )


def fetch_article(url: str, desk: str) -> Article:
    return parse_article(_get(url).text, url, desk)


def fetch_bytes(url: str) -> bytes:
    return _get(url).content
