"""Draws the Short frame by frame with Pillow and pipes it to ffmpeg, so no system fonts or ffmpeg
filters are needed and it renders the same on a laptop and on a GitHub runner."""
from __future__ import annotations

import math
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ImageOps

from .config import FONT_PATH
from .voice import SpokenScene, Word

WIDTH, HEIGHT, FPS = 1080, 1920, 30
MARGIN = 90  # The Shorts interface covers the right edge and roughly the bottom fifth.
FADE_SECONDS = 0.35
HEADLINE_SECONDS = 4.0
CAPTION_CENTRE_Y = 1190
HIGHLIGHT = (255, 196, 46)
DESK_COLOUR = {"ai": (47, 58, 143), "markets": (201, 138, 11)}
DESK_LABEL = {"ai": "AI NEWS", "markets": "INDIAN MARKETS"}


def _font(size: int, weight: int = 800) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(FONT_PATH), size)
    font.set_variation_by_axes([weight])
    return font


def _wrap(text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if font.getlength(candidate) <= width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    return lines + ([current] if current else [])


def _vertical_shade(stops: list[tuple[float, int]]) -> Image.Image:
    """A black layer whose opacity follows (position, alpha) stops down the frame."""
    mask = Image.new("L", (1, HEIGHT))
    for y in range(HEIGHT):
        position = y / (HEIGHT - 1)
        for (p0, a0), (p1, a1) in zip(stops, stops[1:]):
            if p0 <= position <= p1:
                mask.putpixel((0, y), int(a0 + (a1 - a0) * (position - p0) / (p1 - p0)))
                break
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    layer.putalpha(mask.resize((WIDTH, HEIGHT)))
    return layer


def _base_layer(desk: str) -> Image.Image:
    layer = _vertical_shade([(0, 200), (0.2, 40), (0.45, 90), (0.72, 190), (1, 235)])
    draw = ImageDraw.Draw(layer)
    label_font = _font(36)
    label = DESK_LABEL[desk]
    box = draw.textbbox((MARGIN + 28, 142), label, font=label_font)
    draw.rounded_rectangle((box[0] - 28, box[1] - 16, box[2] + 28, box[3] + 16), radius=14, fill=(*DESK_COLOUR[desk], 255))
    draw.text((MARGIN + 28, 142), label, font=label_font, fill="white")
    draw.text((box[2] + 56, 142), "The Daily Circuit", font=_font(38, 700), fill="white", stroke_width=2, stroke_fill=(0, 0, 0, 180))
    disclosure = "AI-generated voice and images, not footage of the events"
    draw.text((MARGIN, 1490), disclosure, font=_font(27, 500), fill=(235, 235, 240, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    return layer


def _headline_layer(title: str) -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for size in (74, 66, 58, 52):
        font = _font(size, 800)
        lines = _wrap(title, font, WIDTH - 2 * MARGIN - 40)
        if len(lines) <= 5:
            break
    if len(lines) > 5:
        lines = lines[:5]
        lines[-1] = lines[-1].rstrip(" ,.;:") + "…"
    line_height = int(size * 1.2)
    top = 270
    bottom = top + line_height * len(lines)
    draw.rounded_rectangle((MARGIN - 20, top - 30, WIDTH - MARGIN + 20, bottom + 30), radius=24, fill=(10, 12, 32, 215))
    for index, line in enumerate(lines):
        draw.text((MARGIN + 10, top + index * line_height), line, font=font, fill="white")
    return layer


def _end_card() -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.text((WIDTH / 2, 760), "Full story, with sources", font=_font(58, 600), fill="white", anchor="mm")
    draw.text((WIDTH / 2, 870), "aiblog.fun", font=_font(120, 900), fill=HIGHLIGHT, anchor="mm")
    draw.text((WIDTH / 2, 985), "New edition every evening, 9 pm IST", font=_font(42, 500), fill=(225, 225, 235), anchor="mm")
    return layer


def _caption_chunks(words: list[Word]) -> list[list[Word]]:
    """Groups words into short pages: at most four words, split after a pause."""
    chunks: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        too_long = len(current) >= 4 or sum(len(w.text) + 1 for w in current) + len(word.text) > 24
        paused = bool(current) and word.start - current[-1].end > 0.25
        if current and (too_long or paused):
            chunks.append(current)
            current = []
        current.append(word)
    return chunks + ([current] if current else [])


def _caption_layer(chunk: list[Word], active: int) -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = _font(92)
    space = font.getlength(" ")
    lines: list[list[int]] = [[]]
    used = 0.0
    for index, word in enumerate(chunk):
        width = font.getlength(word.text)
        if lines[-1] and used + space + width > WIDTH - 2 * MARGIN:
            lines.append([])
            used = 0.0
        used += width + (space if lines[-1] else 0)
        lines[-1].append(index)
    line_height = 112
    y = CAPTION_CENTRE_Y - line_height * len(lines) / 2
    for line in lines:
        total = sum(font.getlength(chunk[i].text) for i in line) + space * (len(line) - 1)
        x = (WIDTH - total) / 2
        for index in line:
            colour = HIGHLIGHT if index == active else "white"
            draw.text((x, y), chunk[index].text, font=font, fill=colour, stroke_width=7, stroke_fill="black")
            x += font.getlength(chunk[index].text) + space
        y += line_height
    return layer


def _prepare(image: Image.Image) -> Image.Image:
    """Scales to cover the frame with room left over for slow movement."""
    return ImageOps.fit(image, (int(WIDTH * 1.2), int(HEIGHT * 1.2)), Image.Resampling.LANCZOS)


def _moving_frame(source: Image.Image, index: int, progress: float) -> Image.Image:
    """Slow zoom and drift; alternate scenes reverse so consecutive shots do not feel the same."""
    eased = progress * progress * (3 - 2 * progress)
    zoom = 1.0 + 0.16 * (eased if index % 2 == 0 else 1 - eased)
    width, height = source.width / zoom, source.height / zoom
    spare_x, spare_y = source.width - width, source.height - height
    drift = 0.5 + (0.3 if index % 4 < 2 else -0.3) * (eased - 0.5)
    left, top = spare_x * drift, spare_y * 0.5
    return source.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR, box=(left, top, left + width, top + height))


def render_video(images: list[Image.Image], scenes: list[SpokenScene], audio: Path, title: str, desk: str, output: Path, end_scene: bool = True) -> None:
    """`images` pairs with the narrated scenes; the last scene, when `end_scene`, shows the end card over the previous image."""
    sources = [_prepare(image) for image in images]
    base, headline, end_card = _base_layer(desk), _headline_layer(title), _end_card()
    last_content = len(scenes) - 2 if end_scene else len(scenes) - 1
    duration = scenes[-1].end
    frames = math.ceil(duration * FPS)

    pages: list[tuple[int, list[Word], float, float]] = []
    for scene_index, scene in enumerate(scenes[: last_content + 1]):
        chunks = _caption_chunks(scene.words)
        for chunk_index, chunk in enumerate(chunks):
            until = chunks[chunk_index + 1][0].start if chunk_index + 1 < len(chunks) else scene.end
            pages.append((scene_index, chunk, chunk[0].start, until))

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryFile() as log:
        encoder = subprocess.Popen(
            [
                ffmpeg, "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-",
                "-i", str(audio),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
                str(output),
            ],
            stdin=subprocess.PIPE, stderr=log,
        )  # fmt: skip
        cached_key, cached_layer = None, None
        page_cursor = 0
        try:
            for number in range(frames):
                now = number / FPS
                current = next((i for i, s in enumerate(scenes) if now < s.end), len(scenes) - 1)
                image_index = min(current, last_content)
                span = scenes[image_index].end - scenes[image_index].start
                if end_scene and current > last_content:
                    span += scenes[current].end - scenes[current].start
                progress = min(1.0, (now - scenes[image_index].start) / span)
                frame = _moving_frame(sources[image_index], image_index, progress)

                since_start = now - scenes[current].start
                if 0 < image_index == current and since_start < FADE_SECONDS:
                    previous = _moving_frame(sources[image_index - 1], image_index - 1, 1.0)
                    frame = Image.blend(previous, frame, since_start / FADE_SECONDS)

                while page_cursor + 1 < len(pages) and pages[page_cursor + 1][2] <= now:
                    page_cursor += 1
                page, active = None, -1
                if pages and pages[page_cursor][2] <= now < pages[page_cursor][3]:
                    page = pages[page_cursor]
                    active = max((i for i, w in enumerate(page[1]) if w.start <= now), default=0)

                is_end = end_scene and current > last_content
                show_headline = current == 0 and now < HEADLINE_SECONDS
                key = (is_end, show_headline, page_cursor if page else None, active)
                if key != cached_key:
                    # The end card dims the picture but not the base layer, so the AI disclosure stays legible to the last frame.
                    cached_layer = Image.new("RGBA", (WIDTH, HEIGHT), (6, 8, 26, 205) if is_end else (0, 0, 0, 0))
                    cached_layer.alpha_composite(base)
                    if is_end:
                        cached_layer.alpha_composite(end_card)
                    if show_headline:
                        cached_layer.alpha_composite(headline)
                    if page and not is_end:
                        cached_layer.alpha_composite(_caption_layer(page[1], active))
                    cached_key = key
                frame.paste(cached_layer, (0, 0), cached_layer)

                bar = ImageDraw.Draw(frame)
                bar.rectangle((0, 0, int(WIDTH * now / duration), 9), fill=HIGHLIGHT)
                encoder.stdin.write(frame.tobytes())
            encoder.stdin.close()
        except BrokenPipeError:
            pass
        if encoder.wait() != 0:
            log.seek(0)
            raise RuntimeError(f"ffmpeg failed: {log.read().decode(errors='replace')[-800:]}")
