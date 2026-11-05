"""YouTube Data API v3, called directly: refresh the token, read past uploads, upload a video."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

from .config import env, site_url
from .source import Article

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
NEWS_AND_POLITICS = "25"
HASHTAGS = {"ai": "#Shorts #AI #AINews #Tech", "markets": "#Shorts #IndianMarkets #StockMarketIndia #SEBI"}


def has_credentials() -> bool:
    return all(env(k) for k in ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"))


def access_token() -> str:
    res = requests.post(
        TOKEN_URL,
        data={
            "client_id": env("YOUTUBE_CLIENT_ID"),
            "client_secret": env("YOUTUBE_CLIENT_SECRET"),
            "refresh_token": env("YOUTUBE_REFRESH_TOKEN"),
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    if res.status_code != 200:
        # invalid_grant: the consent screen is still in Testing (tokens last 7 days) or access was revoked.
        raise RuntimeError(f"Could not refresh the YouTube token ({res.status_code}): {res.json().get('error', res.text[:200])}. Run auth.py again.")
    return res.json()["access_token"]


def _check(res: requests.Response) -> dict:
    if not res.ok:
        raise RuntimeError(f"YouTube API {res.status_code}: {res.text[:600]}")
    return res.json()


def uploaded_article_urls(token: str) -> list[str]:
    """Article links from the channel's latest uploads, newest first. The channel itself is the record
    of what has been published, so nothing has to be committed and no separate state can drift."""
    headers = {"Authorization": f"Bearer {token}"}
    channels = _check(requests.get(f"{API}/channels", headers=headers, params={"part": "contentDetails", "mine": "true"}, timeout=30))
    if not channels.get("items"):
        raise RuntimeError("This Google account has no YouTube channel yet. Create one, then run auth.py again.")
    playlist = channels["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    items = requests.get(f"{API}/playlistItems", headers=headers, params={"part": "snippet", "playlistId": playlist, "maxResults": 50}, timeout=30)
    if items.status_code == 404:  # A brand-new channel has no uploads playlist yet.
        return []
    pattern = re.compile(re.escape(site_url()) + r"/[^\s)]+")
    urls = []
    for item in _check(items).get("items", []):
        match = pattern.search(item["snippet"].get("description", ""))
        if match:
            urls.append(match.group(0))
    return urls


def build_metadata(article: Article, privacy: str, headline: str = "") -> dict:
    title = re.sub(r"[<>]", "", headline or article.title)
    suffix = " #Shorts"
    if len(title) + len(suffix) > 100:
        title = title[: 100 - len(suffix) - 1].rsplit(" ", 1)[0].rstrip(" ,.;:-") + "…"
    lines = [
        article.summary,
        "",
        f"Full story and sources: {article.url}",
        "",
        "Written and voiced with AI from The Daily Circuit's published article. Images are AI-generated and are not photographs of the events described.",
    ]
    if article.desk == "markets":
        lines.append("News summary only, not investment advice.")
    lines += ["", HASHTAGS[article.desk]]
    tags, length = [], 0
    for tag in ["The Daily Circuit", *article.keywords]:
        tag = re.sub(r"[<>,]", "", tag)
        if length + len(tag) + 3 > 450:
            break
        tags.append(tag)
        length += len(tag) + 3
    return {
        "snippet": {
            "title": title + suffix,
            "description": re.sub(r"[<>]", "", "\n".join(lines))[:4900],
            "tags": tags,
            "categoryId": NEWS_AND_POLITICS,
            "defaultLanguage": "en",
            "defaultAudioLanguage": "en-IN",
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": True,
            "embeddable": True,
        },
    }


def upload(video: Path, metadata: dict, token: str) -> str:
    size = video.stat().st_size
    start = requests.post(
        UPLOAD_URL,
        params={"uploadType": "resumable", "part": "snippet,status"},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(size),
        },
        data=json.dumps(metadata),
        timeout=60,
    )
    if not start.ok:
        raise RuntimeError(f"YouTube refused the upload ({start.status_code}): {start.text[:600]}")
    session = start.headers["Location"]

    offset = 0
    for attempt in range(5):
        try:
            with video.open("rb") as body:
                body.seek(offset)
                headers = {"Content-Type": "video/mp4", "Content-Length": str(size - offset)}
                if offset:
                    headers["Content-Range"] = f"bytes {offset}-{size - 1}/{size}"
                res = requests.put(session, data=body, headers=headers, timeout=600, allow_redirects=False)
            if res.ok:
                return res.json()["id"]
            if res.status_code != 308 and res.status_code < 500:
                raise RuntimeError(f"YouTube rejected the video ({res.status_code}): {res.text[:600]}")
            print(f"  upload got {res.status_code}, resuming")
        except requests.RequestException as error:
            print(f"  upload interrupted ({type(error).__name__}), resuming")
        time.sleep(10 * 2**attempt)
        # Ask how much arrived rather than starting over: the first attempt may in fact have finished.
        try:
            status = requests.put(session, headers={"Content-Range": f"bytes */{size}", "Content-Length": "0"}, timeout=60, allow_redirects=False)
        except requests.RequestException:
            continue
        if status.ok:
            return status.json()["id"]
        if status.status_code == 308:
            received = re.search(r"bytes=0-(\d+)", status.headers.get("Range", ""))
            offset = int(received.group(1)) + 1 if received else 0
    raise RuntimeError("Upload failed after 5 attempts")
