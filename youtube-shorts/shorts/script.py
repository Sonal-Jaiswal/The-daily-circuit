"""Turns an article into narration. Free LLMs write it; deterministic checks keep it faithful to the
article, and the article's own key facts are the fallback when no draft passes."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

import requests

from .config import env
from .source import Article, clean_text

MIN_WORDS, MAX_WORDS = 50, 125
ADVICE = re.compile(r"\b(should|must|better) (buy|sell|invest|hold)\b|\b(buy now|sell now|invest now|sure[- ]shot|multibagger|guaranteed returns?|target price)\b", re.I)
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
FILLER = re.compile(r"^(hey|hi|hello|welcome|what's up|did you know)\b", re.I)


@dataclass
class Scene:
    narration: str
    image_subject: str


@dataclass
class Script:
    scenes: list[Scene]
    author: str  # the provider that wrote it, or "key-facts"


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in NUMBER.findall(text)}


def problems(scenes: list[Scene], article: Article) -> list[str]:
    """Why a draft cannot be used; empty when it passes. A false alarm only costs a retry."""
    found = []
    text = " ".join(s.narration for s in scenes)
    words = len(text.split())
    if not 3 <= len(scenes) <= 7:
        found.append(f"{len(scenes)} scenes")
    if not MIN_WORDS <= words <= MAX_WORDS:
        found.append(f"{words} words")
    if FILLER.match(text):
        found.append("opens with filler")
    if ADVICE.search(text):
        found.append("sounds like investment advice")
    corpus = article.corpus.lower()
    unknown = _numbers(text) - _numbers(article.corpus)
    if unknown:
        found.append(f"figures not in the article: {sorted(unknown)}")
    names = set()
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        names.update(re.findall(r"\b[A-Z][\w'’-]*", " ".join(sentence.split()[1:])))
    unknown_names = {n for n in names if n.lower().rstrip("'’s") not in corpus and n.lower() not in corpus}
    if unknown_names:
        found.append(f"names not in the article: {sorted(unknown_names)}")
    return found


def _prompt(article: Article) -> str:
    source = {
        "headline": article.title,
        "summary": article.summary,
        "key_facts": article.key_facts,
        "article": article.paragraphs,
    }
    return f"""You write narration for a 40 second vertical news video for The Daily Circuit.

Rules for the narration:
- Between 80 and 105 words in total, split into 4 to 6 scenes of one or two short spoken sentences each.
- The first scene states the actual news in plain words. No greeting, no question, no clickbait.
- Use only facts in the source below. Add no opinion, prediction, background or outside knowledge.
- Write every figure in digits exactly as the source does. Do not round or convert.
- Never recommend buying, selling or holding anything.
- Do not mention this channel or a website, and do not add a closing line.

Rules for image_subject, one per scene:
- A short description of a real-looking scene of physical objects, materials, machinery or buildings that suits the scene.
- No people, faces, robots, logos, or brand or company names.
- Nothing that would contain writing or data: no screens, laptops, phones, apps, charts, graphs, diagrams, documents, signs or software terms.

Reply with only this JSON:
{{"scenes": [{{"narration": "...", "image_subject": "..."}}]}}

Source:
{json.dumps(source, ensure_ascii=False)}"""


def _parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start : end + 1])


def _gemini(prompt: str, key: str, model: str) -> str:
    res = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
        },
        timeout=90,
    )
    res.raise_for_status()
    return res.json()["candidates"][0]["content"]["parts"][0]["text"]


def _openai_compat(prompt: str, base_url: str, key: str, model: str) -> str:
    res = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "HTTP-Referer": "https://aiblog.fun", "X-Title": "The Daily Circuit"},
        json={"model": model, "temperature": 0.4, "messages": [{"role": "user", "content": prompt}]},
        timeout=120,
    )
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]


def _providers() -> list[tuple[str, callable]]:
    """Only free tiers, in the same order the newsroom prefers them. Providers without a key are skipped."""
    providers: list[tuple[str, callable]] = []
    if key := env("GEMINI_API_KEY"):
        model = env("GEMINI_MODEL", "gemini-3.5-flash-lite")
        providers.append((f"gemini/{model}", lambda p, k=key, m=model: _gemini(p, k, m)))
    if key := env("GROQ_API_KEY"):
        model = env("GROQ_MODEL", "openai/gpt-oss-120b")
        providers.append((f"groq/{model}", lambda p, k=key, m=model: _openai_compat(p, "https://api.groq.com/openai/v1", k, m)))
    if key := env("OPENROUTER_API_KEY"):
        for model in filter(None, (m.strip() for m in env("OPENROUTER_MODELS").split(","))):
            if model.endswith(":free"):
                providers.append((f"openrouter/{model}", lambda p, k=key, m=model: _openai_compat(p, "https://openrouter.ai/api/v1", k, m)))
    return providers


def _from_key_facts(article: Article) -> list[Scene]:
    subject = article.title
    lines = [article.summary, *article.key_facts]
    scenes: list[Scene] = []
    words = 0
    for line in lines:
        count = len(line.split())
        if line and words + count <= 105 and len(scenes) < 6:
            scenes.append(Scene(line, subject))
            words += count
    return scenes


def write_script(article: Article) -> Script:
    prompt = _prompt(article)
    for name, call in _providers():
        try:
            data = _parse_json(call(prompt))
            scenes = [Scene(clean_text(str(s["narration"])), clean_text(str(s.get("image_subject") or article.title))) for s in data["scenes"]]
        except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as error:
            # str(error) from requests can include the URL but never the key: keys travel in headers.
            print(f"  {name} failed: {type(error).__name__}: {error}")
            continue
        issues = problems(scenes, article)
        if not issues:
            return Script(scenes, name)
        print(f"  {name} draft rejected: {'; '.join(issues)}")
    print("  using the article's key facts as the script")
    return Script(_from_key_facts(article), "key-facts")
