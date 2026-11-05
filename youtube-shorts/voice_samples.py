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
PREBUILT = ["Achird", "Sulafat", "Aoede", "Sadachbia"]
MAX_LIBRARY_VOICES = 6


def main() -> None:
    load_dotenv()
    out = OUTPUT_DIR / "samples"
    out.mkdir(parents=True, exist_ok=True)

    voices = gemini_voice.list_voices()
    print(f"{len(voices)} en-IN voices in the library")
    for voice in voices:
        print(" ", voice.get("id"), "|", voice.get("display_name"), "|", voice.get("gender"), "|", voice.get("pitch"), "|", voice.get("accent"), "|", (voice.get("description") or "")[:90])

    women = [v for v in voices if str(v.get("gender", "")).lower().startswith("f")]
    men = [v for v in voices if str(v.get("gender", "")).lower().startswith("m")]
    half = MAX_LIBRARY_VOICES // 2
    chosen = [(f"india-{v.get('gender', '')}-{v.get('display_name') or v['id']}", v["id"]) for v in women[:half] + men[:half]]
    chosen += [(f"prebuilt-{name}", name) for name in PREBUILT]

    for label, voice in chosen:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)
        try:
            (out / f"{safe}.wav").write_bytes(gemini_voice.speak(SAMPLE, voice))
            print(f"ok    {safe}")
        except Exception as error:
            print(f"FAIL  {safe}: {error}")
        time.sleep(8)  # The free tier allows only a few requests a minute.


if __name__ == "__main__":
    main()
