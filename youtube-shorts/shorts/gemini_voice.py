"""Gemini's speech models: free tier, and they take direction on tone and pacing."""
from __future__ import annotations

import base64
import time

import requests

from .config import env

API = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_VOICE = "en-in-commercial-8"
# Accent comes from the voice itself; Google advises against asking for one in the style.
STYLE = (
    "A warm, confident young news presenter telling a friend something interesting they just heard. "
    "Natural and conversational, with real energy and smiles in the voice, varied rhythm, "
    "and brief pauses for effect. Never flat, never reading aloud."
)


def list_voices(language_code: str = "en-IN") -> list[dict]:
    res = requests.get(
        f"{API}/voices",
        headers={"x-goog-api-key": env("GEMINI_API_KEY")},
        params={"language_code": language_code, "page_size": 100},
        timeout=30,
    )
    res.raise_for_status()
    return res.json().get("voices", [])


def speak(text: str, voice: str, style: str = STYLE) -> bytes:
    """Returns WAV bytes (24 kHz mono). Tries the richer model first, then the lighter one."""
    last_error: Exception | None = None
    for model in ("gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"):
        for attempt in range(3):
            try:
                res = requests.post(
                    f"{API}/interactions",
                    headers={"x-goog-api-key": env("GEMINI_API_KEY")},
                    json={
                        "model": model,
                        "input": [{"type": "user_input", "content": [{"type": "text", "text": text, "annotations": [{"type": "speech_metadata", "style": style}]}]}],
                        "response_format": {"type": "audio"},
                        "generation_config": {"speech_config": [{"voice": voice}]},
                    },
                    timeout=180,
                )
            except requests.RequestException as error:
                last_error = error
                time.sleep(10 * (attempt + 1))
                continue
            if res.status_code in (429, 500, 502, 503, 504):
                last_error = RuntimeError(f"{model} returned {res.status_code}")
                time.sleep(20 * (attempt + 1))
                continue
            if not res.ok:
                last_error = RuntimeError(f"{model} returned {res.status_code}: {res.text[:300]}")
                break
            parts = [c for step in res.json().get("steps", []) if step.get("type") == "model_output" for c in step.get("content", []) if c.get("type") == "audio"]
            if parts:
                return base64.b64decode(parts[-1]["data"])
            last_error = RuntimeError(f"{model} returned no audio")
            break
    raise RuntimeError(f"Gemini speech failed: {last_error}")
