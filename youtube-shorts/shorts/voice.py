"""Narration with Microsoft's neural voices through edge-tts: free, no key, and it reports word timings."""
from __future__ import annotations

import asyncio
import re
import subprocess
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path

import edge_tts
import imageio_ffmpeg

from .config import env

SAMPLE_RATE = 44100
GAP_SECONDS = 0.15
# Written one way, spoken another: said as a word ("say-bee"), not spelled out. Captions keep the written form.
SPOKEN = {"SEBI": "Sebi"}


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class SpokenScene:
    start: float
    end: float
    words: list[Word] = field(default_factory=list)


def _speakable(text: str) -> str:
    for written, spoken in SPOKEN.items():
        text = re.sub(rf"\b{written}\b", spoken, text)
    return text


def displayable(word: str) -> str:
    """Puts the written form back for captions, including inside "Sebi's"."""
    for written, spoken in SPOKEN.items():
        word = re.sub(rf"\b{spoken}\b", written, word)
    return word


async def _synthesise(text: str, mp3: Path) -> list[Word]:
    tts = edge_tts.Communicate(_speakable(text), env("TTS_VOICE", "en-IN-NeerjaNeural"), rate=env("TTS_RATE", "+8%"), boundary="WordBoundary")
    words: list[Word] = []
    with mp3.open("wb") as out:
        async for chunk in tts.stream():
            if chunk["type"] == "audio":
                out.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 10_000_000
                words.append(Word(displayable(chunk["text"].strip()), start, start + chunk["duration"] / 10_000_000))
    return words


def _with_retries(text: str, mp3: Path) -> list[Word]:
    # The service is unofficial and occasionally refuses a connection.
    for attempt in range(4):
        try:
            return asyncio.run(_synthesise(text, mp3))
        except Exception as error:
            if attempt == 3:
                raise
            print(f"  voice attempt {attempt + 1} failed ({type(error).__name__}), retrying")
            time.sleep(5 * (attempt + 1))
    raise AssertionError("unreachable")


def narrate(lines: list[str], workdir: Path) -> tuple[Path, list[SpokenScene]]:
    """Voices each line separately, so scene changes land exactly on sentence boundaries."""
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    audio_path = workdir / "narration.wav"
    gap = b"\0\0" * int(GAP_SECONDS * SAMPLE_RATE)
    spoken: list[SpokenScene] = []
    clock = 0.0
    with wave.open(str(audio_path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        for index, line in enumerate(lines):
            mp3, part = workdir / f"line{index}.mp3", workdir / f"line{index}.wav"
            words = _with_retries(line, mp3)
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(mp3), "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", str(part)],
                check=True,
            )
            with wave.open(str(part), "rb") as source:
                frames = source.readframes(source.getnframes())
            out.writeframes(frames + gap)
            duration = len(frames) / 2 / SAMPLE_RATE + GAP_SECONDS
            timed = [Word(w.text, clock + w.start, clock + w.end) for w in words]
            spoken.append(SpokenScene(clock, clock + duration, timed))
            clock += duration
    return audio_path, spoken
