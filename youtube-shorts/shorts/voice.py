"""Narration: Gemini's expressive voices, with Microsoft's edge-tts as the free fallback that needs no key."""
from __future__ import annotations

import asyncio
import difflib
import re
import subprocess
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path

import edge_tts
import imageio_ffmpeg
import requests

from . import gemini_voice
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


def narrate_edge(lines: list[str], workdir: Path) -> tuple[Path, list[SpokenScene]]:
    """edge-tts: voices each line separately, so scene changes land exactly on sentence boundaries."""
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


def _token(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def align(written: list[str], heard: list[Word], duration: float) -> list[Word]:
    """Puts the script's own words on the transcript's clock, so captions show what was written even
    where the transcription misheard. Words with no match are spread between their neighbours."""
    times: list[float | None] = [None] * len(written)
    ends: list[float | None] = [None] * len(written)
    matcher = difflib.SequenceMatcher(a=[_token(w) for w in written], b=[_token(w.text) for w in heard], autojunk=False)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            times[block.a + offset] = heard[block.b + offset].start
            ends[block.a + offset] = heard[block.b + offset].end
    known = [i for i, t in enumerate(times) if t is not None]
    anchors = [(-1, 0.0), *((i, times[i]) for i in known), (len(written), duration)]
    for (left, left_time), (right, right_time) in zip(anchors, anchors[1:]):
        gap = right - left
        for i in range(left + 1, right):
            times[i] = left_time + (right_time - left_time) * (i - left) / gap
    result = []
    for i, word in enumerate(written):
        following = times[i + 1] if i + 1 < len(written) else duration
        result.append(Word(word, times[i], ends[i] if ends[i] is not None else following))
    return result


def _transcribe(wav: Path) -> list[Word]:
    """Word timings from Groq's free Whisper. An empty list just means evenly spread captions."""
    key = env("GROQ_API_KEY")
    if not key:
        return []
    try:
        with wav.open("rb") as audio:
            res = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data={"model": "whisper-large-v3-turbo", "response_format": "verbose_json", "language": "en", "timestamp_granularities[]": "word"},
                files={"file": ("narration.wav", audio, "audio/wav")},
                timeout=120,
            )
        res.raise_for_status()
        return [Word(w["word"].strip(), float(w["start"]), float(w["end"])) for w in res.json().get("words", [])]
    except (requests.RequestException, KeyError, ValueError) as error:
        print(f"  word timing failed ({type(error).__name__}), spreading captions evenly")
        return []


def scenes_from_words(lines: list[str], words: list[Word], duration: float) -> list[SpokenScene]:
    """Splits timed words back into the script's lines."""
    scenes: list[SpokenScene] = []
    cursor = 0
    for line in lines:
        count = len(line.split())
        chunk = [Word(displayable(w.text.strip(",.;:!?\"“”")), w.start, w.end) for w in words[cursor : cursor + count]]
        scenes.append(SpokenScene(chunk[0].start, chunk[-1].end, chunk))
        cursor += count
    for scene, following in zip(scenes, scenes[1:]):
        scene.end = following.start
    scenes[0].start = 0.0
    scenes[-1].end = duration
    return scenes


def narrate_gemini(lines: list[str], workdir: Path) -> tuple[Path, list[SpokenScene]]:
    """One continuous performance rather than separate sentences: that is most of what makes it sound human."""
    audio_path = workdir / "narration.wav"
    audio_path.write_bytes(gemini_voice.speak(_speakable(" ".join(lines)), env("GEMINI_VOICE", gemini_voice.DEFAULT_VOICE)))
    with wave.open(str(audio_path), "rb") as source:
        duration = source.getnframes() / source.getframerate()
    written = _speakable(" ".join(lines)).split()
    return audio_path, scenes_from_words(lines, align(written, _transcribe(audio_path), duration), duration)


def narrate(lines: list[str], workdir: Path) -> tuple[Path, list[SpokenScene], str]:
    """Returns the audio, its timed scenes, and which voice made it."""
    if env("GEMINI_API_KEY"):
        try:
            audio, scenes = narrate_gemini(lines, workdir)
            return audio, scenes, "gemini"
        except Exception as error:
            print(f"  Gemini voice failed, using edge-tts: {error}")
    audio, scenes = narrate_edge(lines, workdir)
    return audio, scenes, "edge-tts"
