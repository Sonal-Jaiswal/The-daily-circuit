#!/usr/bin/env python3
"""Reads one short script in several voices, to choose the channel's voice by ear. Output: output/samples/"""
from __future__ import annotations

import time

from shorts import gemini_voice
from shorts.config import OUTPUT_DIR, load_dotenv

SAMPLE = (
    "ChatGPT just picked up a brand new party trick. "
    "Type any silly idea, and it hands you back a looping GIF, one you can actually tweak, frame by frame. "
    "No extra apps. No fuss. Honestly? Your group chats are about to get a lot weirder."
)
# Google's library has 100 Indian English voices; these are the younger, conversational ones.
VOICES = ["en-in-commercial-8", "en-in-commercial-5", "en-in-commercial-3", "en-in-commercial-10", "en-in-commercial-7", "en-in-commercial-9", "en-in-commercial-6", "en-in-assistant-9"]


def main() -> None:
    load_dotenv()
    out = OUTPUT_DIR / "samples"
    out.mkdir(parents=True, exist_ok=True)

    for voice in VOICES:
        try:
            (out / f"{voice}.wav").write_bytes(gemini_voice.speak(SAMPLE, voice))
            print(f"ok    {voice}")
        except Exception as error:
            print(f"FAIL  {voice}: {error}")
        time.sleep(8)  # The free tier allows only a few requests a minute.


if __name__ == "__main__":
    main()
