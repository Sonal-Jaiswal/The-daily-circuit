"""Turns an article into narration. Free LLMs write it; deterministic checks keep it faithful to the
article, and the article's own key facts are the fallback when no draft passes."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

import requests

from .config import env
from .source import Article, clean_text

MIN_WORDS, MAX_WORDS = 35, 80
MAX_FIGURES = 2  # Viewers remember a story, not a list of numbers.
MAX_WRITERS = 3  # Free quotas: if three models cannot make this story work, try another story.
MAX_SENTENCE_WORDS = 20  # Long sentences are what make narration sound read out.
ADVICE = re.compile(r"\b(should|must|better) (buy|sell|invest|hold)\b|\b(buy now|sell now|invest now|sure[- ]shot|multibagger|guaranteed returns?|target price)\b", re.I)
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
FILLER = re.compile(r"^(hey|hi|hello|welcome|what's up|did you know)\b", re.I)


@dataclass
class Scene:
    narration: str
    image_subject: str
    banner: str = ""


@dataclass
class Script:
    scenes: list[Scene]
    author: str  # the provider that wrote it, or "key-facts"
    headline: str = ""


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in NUMBER.findall(text)}


def _unknown_names(text: str, corpus: str) -> set[str]:
    names = set()
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        names.update(re.findall(r"\b[A-Z][\w'’-]*", " ".join(sentence.split()[1:])))
    return {n for n in names if n.lower().rstrip("'’s") not in corpus and n.lower() not in corpus}


def problems(scenes: list[Scene], article: Article, headline: str = "") -> list[str]:
    """Why a draft cannot be used; empty when it passes. A false alarm only costs a retry."""
    found = []
    text = " ".join(s.narration for s in scenes)
    words = len(text.split())
    longest = max((len(s.split()) for s in re.split(r"(?<=[.!?])\s+", text)), default=0)
    if longest > MAX_SENTENCE_WORDS:
        found.append(f"a sentence of {longest} words; the limit is {MAX_SENTENCE_WORDS}")
    if len(NUMBER.findall(text)) > MAX_FIGURES:
        found.append("too many figures to listen to")
    screen_text = [headline, *(s.banner for s in scenes)]
    if any(len(line.split()) > 8 for line in screen_text):
        found.append("on-screen text too long")
    corpus_numbers = _numbers(article.corpus)
    for line in screen_text:
        if _numbers(line) - corpus_numbers:
            found.append(f"on-screen figure not in the article: {line}")
        # Title Case Lines Capitalise Everything, so only sentence-case lines can be checked for names.
        line_words = line.split()
        if line_words and sum(w[0].isupper() for w in line_words) / len(line_words) < 0.6 and _unknown_names(line, article.corpus.lower()):
            found.append(f"on-screen name not in the article: {line}")
    if not 3 <= len(scenes) <= 5:
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
    unknown_names = _unknown_names(text, corpus)
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
    return f"""You write Shorts for The Daily Circuit: a person telling someone a story they will want to repeat, not a summary being read out.

Turn the source into a spoken story of 45 to 65 words in total, split into 3 or 4 scenes.
- Scene 1 is the hook: the most surprising or useful thing in the story, in one short punchy line that makes people stay. It must still be true.
- The middle says what actually happened in plain words, and why it matters to an ordinary person.
- The last scene leaves one thing worth remembering. Do not end with a question to the audience or a call to follow.

How it should sound:
- Everyday spoken English with contractions and short sentences. Something you would say to a friend.
- Pick only the one idea that matters and leave the rest out. Never list features, names of plans, or specifications.
- Avoid numbers. Use one only if the number itself is the story, written in digits exactly as in the source.
- Every sentence under 16 words where you can, and never over 20.
- A school student must understand every word. If a term needs explaining, say what it means for people in everyday words instead, or leave it out. Regulatory and financial terms always count as jargon.
- Leave out product version numbers.
- Never say "according to", "the article", "in a statement", "breaking" or "live".

Stay honest:
- Use only facts in the source. Why it matters may only restate what the source supports. Do not add benefits, effects, predictions, opinions or hype beyond it. An independent checker rejects any claim the source does not support.
- Never recommend buying, selling or holding anything.
- Do not mention this channel or a website.

Also write:
- headline: at most 7 words, catchy and true, in sentence case, for the top of the video and the title.
- banner, one per scene: at most 6 words, in sentence case, the point of that scene like a TV news banner. Not a copy of the narration.
- image_subject, one per scene: a short description of a real-looking scene of physical objects, materials, machinery or buildings that suits the scene. No people, faces, robots, logos, or brand or company names. Nothing that would contain writing or data: no screens, laptops, phones, apps, charts, graphs, diagrams, documents, signs or software terms. No banknotes or coins.

Reply with only this JSON:
{{"headline": "...", "scenes": [{{"narration": "...", "banner": "...", "image_subject": "..."}}]}}

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


def has_providers() -> bool:
    return bool(_providers())


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
    """The plain version, for when no provider answers: short, because nobody stays for a list."""
    scenes: list[Scene] = []
    words = 0
    for line in [article.summary, *article.key_facts]:
        count = len(line.split())
        if line and words + count <= 60 and len(scenes) < 4:
            scenes.append(Scene(line, article.title, article.title if not scenes else ""))
            words += count
    return scenes


def _fact_check_prompt(scenes: list[Scene], headline: str, article: Article) -> str:
    source = {"summary": article.summary, "key_facts": article.key_facts, "article": article.paragraphs}
    script = {"headline": headline, "banners": [s.banner for s in scenes], "narration": [s.narration for s in scenes]}
    return f"""Fact-check a short news video script against its source. Nothing else may be assumed.

This video is published with no human editor, so catch anything that would mislead a viewer, and only that. List a claim as unsupported if:
- the fact is not in the source, even if it seems a reasonable inference;
- it adds a benefit, effect on people, cause or prediction the source does not give;
- it is firmer than the source, for example the source says "potentially" or "could" and the script says it does;
- it promises more than the source, for example "you'll never need to mail anything" when the source does not say so.

Do not object to any of these, which are normal plain-English retelling:
- Simplifying official terms into everyday words, when the meaning stays the same. "Non-resident clients" can be "people living abroad", and a removed requirement can be "you no longer have to".
- Speaking to the viewer as "you".
- Leaving out a condition or detail, as long as the main limit on who it applies to is stated somewhere in the script.
- Catchy wording, when the fact underneath is in the source.

Reply with only this JSON:
{{"unsupported": ["the claim, and why", "..."]}}
Use an empty list if everything is supported.

Source:
{json.dumps(source, ensure_ascii=False)}

Script:
{json.dumps(script, ensure_ascii=False)}"""


def _fact_check(scenes: list[Scene], headline: str, article: Article, writer: str, providers: list) -> list[str] | None:
    """Claims a second model could not find in the source, or None if nobody could check.

    A different model checks where possible, since a model is poor at catching its own additions."""
    prompt = _fact_check_prompt(scenes, headline, article)
    for name, call in sorted(providers, key=lambda p: p[0] == writer):
        try:
            found = _parse_json(call(prompt))["unsupported"]
            print(f"  fact-checked by {name}: {len(found)} unsupported")
            return [str(claim) for claim in found]
        except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as error:
            print(f"  {name} could not fact-check: {type(error).__name__}")
    return None


def write_script(article: Article) -> Script:
    prompt = _prompt(article)
    providers = _providers()
    for name, call in providers[:MAX_WRITERS]:
        feedback = ""
        for _attempt in range(2):
            try:
                data = _parse_json(call(prompt + feedback))
                scenes = [Scene(clean_text(str(s["narration"])), clean_text(str(s.get("image_subject") or article.title)), clean_text(str(s.get("banner") or ""))) for s in data["scenes"]]
                headline = clean_text(str(data.get("headline") or article.title))
            except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as error:
                # str(error) from requests can include the URL but never the key: keys travel in headers.
                print(f"  {name} failed: {type(error).__name__}: {error}")
                break
            issues = problems(scenes, article, headline)
            if not issues:
                # No editor sees this video, so a script that could not be checked is not used.
                issues = _fact_check(scenes, headline, article, name, providers)
                if issues is None:
                    issues = ["no model available to fact-check it"]
            if not issues:
                return Script(scenes, name, headline)
            print(f"  {name} draft rejected: {'; '.join(issues)[:400]}")
            feedback = "\n\nYour previous draft was rejected for these reasons. Fix them:\n- " + "\n- ".join(issues)
    print("  no draft passed; falling back to the article's key facts")
    return Script(_from_key_facts(article), "key-facts", article.title)


def most_watchable(candidates: list, limit: int = 10):
    """Of these stories, the one an ordinary viewer would most want to hear about. Falls back to the first."""
    if len(candidates) < 2:
        return candidates[0] if candidates else None
    shortlist = candidates[:limit]
    titles = "\n".join(f"{i}. {item.title}" for i, item in enumerate(shortlist))
    prompt = f"""Which of these news stories would ordinary people most want to hear about in a 25 second video? Prefer stories that affect their money, work or daily life, or that are genuinely surprising. Avoid routine regulatory process.

{titles}

Reply with only this JSON: {{"best": <number>}}"""
    for name, call in _providers():
        try:
            best = int(_parse_json(call(prompt))["best"])
            if 0 <= best < len(shortlist):
                print(f"  {name} chose: {shortlist[best].title}")
                return shortlist[best]
        except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as error:
            print(f"  {name} could not choose a story: {type(error).__name__}")
    return shortlist[0]
