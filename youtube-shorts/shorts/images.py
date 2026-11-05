"""One image per scene: Cloudflare's free FLUX allocation, then the article's own image, then a plain gradient."""
from __future__ import annotations

import base64
import io
import re

import requests
from PIL import Image

from .config import env
from .source import Article, fetch_bytes

GRADIENTS = {"ai": ((16, 20, 58), (47, 58, 143)), "markets": ((58, 36, 8), (135, 89, 10))}


def photo_prompt(subject: str) -> str:
    """Same rules as the site's realistic images (packages/core/src/images/illustrate.ts): objects and
    places only, so a frame cannot pass as a news photo of a real person or event. The model largely
    ignores "no ..." instructions, so words that summon robots or figures are rephrased first."""
    scene = re.sub(r"[\"“”]", "", subject)
    scene = re.sub(r"\b(humanoid|android|cyborg)s?\b", "machinery", scene, flags=re.I)
    scene = re.sub(r"\brobot(ic|s|ics)?\b", "automated machinery", scene, flags=re.I)
    scene = re.sub(r"\bAI agents?\b", "software system", scene, flags=re.I)
    scene = re.sub(r"\b(person|people|man|woman|men|women|CEO|executive|founder|judge|official)s?\b", "office", scene, flags=re.I)
    return " ".join(
        [
            f"Editorial stock photograph evoking this theme: {scene[:300]}.",
            "Show objects, places, technology, documents, architecture or abstract scenes only, as a symbolic visual rather than a depiction of a specific real event.",
            "Realistic professional photography, natural light, shallow depth of field, clean composition centred in the frame, muted colour grading with deep indigo and warm amber tones.",
            "Strictly no people, faces, hands, silhouettes or crowds; no robots, humanoids, mannequins, statues or anything with a face; no text, letters, numbers, logos, brand marks, signs, displays with writing, flags or watermarks.",
            "Prefer close-up details of hardware, materials, buildings, landscapes or laboratory equipment.",
        ]
    )


def _cloudflare(prompt: str, account: str, token: str, model: str) -> Image.Image:
    res = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}",
        headers={"Authorization": f"Bearer {token}"},
        # The REST schema rejects `seed`; 8 steps is the maximum and the most detailed.
        json={"prompt": prompt, "steps": 8},
        timeout=90,
    )
    res.raise_for_status()
    body = res.json()
    encoded = body.get("result", {}).get("image") or body.get("image")
    if not encoded:
        raise ValueError("response contained no image")
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")


def gradient(desk: str, size: tuple[int, int] = (1080, 1920)) -> Image.Image:
    top, bottom = GRADIENTS[desk]
    column = Image.new("RGB", (1, 256))
    for y in range(256):
        column.putpixel((0, y), tuple(top[c] + (bottom[c] - top[c]) * y // 255 for c in range(3)))
    return column.resize(size, Image.Resampling.BICUBIC)


def scene_images(subjects: list[str], article: Article) -> tuple[list[Image.Image], str]:
    """Returns one image per subject and the name of what produced them, for the logs."""
    fallback = None
    if article.hero_url:
        try:
            fallback = Image.open(io.BytesIO(fetch_bytes(article.hero_url))).convert("RGB")
        except Exception as error:
            print(f"  article image unavailable: {error}")
    fallback = fallback or gradient(article.desk)

    account, token = env("CLOUDFLARE_ACCOUNT_ID"), env("CLOUDFLARE_AI_TOKEN")
    if not (account and token):
        return [fallback] * len(subjects), "article image"
    model = env("CLOUDFLARE_IMAGE_MODEL", "@cf/black-forest-labs/flux-1-schnell")
    images, generated = [], 0
    for subject in subjects:
        try:
            images.append(_cloudflare(photo_prompt(subject), account, token, model))
            generated += 1
        except Exception as error:
            print(f"  image generation failed, using the fallback: {type(error).__name__}")
            images.append(fallback)
    return images, f"{model} ({generated}/{len(subjects)})"
