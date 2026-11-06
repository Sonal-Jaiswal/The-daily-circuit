"""Draws the Short frame by frame with Pillow and pipes it to ffmpeg, so no system fonts or ffmpeg
filters are needed and it renders the same on a laptop and on a GitHub runner.

The layout follows a TV news screen: channel bug at the top, a headline that lands first, then a
lower-third banner for each point, a ticker of real headlines, and captions for people watching muted."""
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
MARGIN = 70  # The Shorts interface covers the right edge and roughly the bottom fifth.
FADE_SECONDS = 0.2
HEADLINE_SECONDS = 2.6
SLIDE_SECONDS = 0.3
CAPTION_CENTRE_Y = 1040
BANNER_TOP = 1215
TICKER_TOP = 1420
TICKER_HEIGHT = 66
TICKER_SPEED = 170  # pixels per second
HIGHLIGHT = (255, 196, 46)
DESK_COLOUR = {"ai": (67, 83, 216), "markets": (214, 120, 16)}
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
    layer = _vertical_shade([(0, 190), (0.16, 30), (0.42, 40), (0.62, 170), (1, 245)])
    draw = ImageDraw.Draw(layer)
    label_font = _font(36)
    label = DESK_LABEL[desk]
    box = draw.textbbox((MARGIN + 24, 132), label, font=label_font)
    draw.rectangle((box[0] - 24, box[1] - 16, box[2] + 24, box[3] + 16), fill=(*DESK_COLOUR[desk], 255))
    draw.text((MARGIN + 24, 132), label, font=label_font, fill="white")
    draw.rectangle((box[2] + 24, box[1] - 16, box[2] + 400, box[3] + 16), fill=(12, 14, 34, 235))
    draw.text((box[2] + 46, 132), "The Daily Circuit", font=_font(36, 700), fill="white")
    # Kept on every frame, so the video never passes as footage of real events.
    draw.text((MARGIN, 208), "AI-generated voice and images", font=_font(27, 500), fill=(235, 235, 240, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    return layer


def _headline_layer(title: str) -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for size in (104, 92, 80, 68, 58):
        font = _font(size, 900)
        lines = _wrap(title, font, WIDTH - 2 * MARGIN - 50)
        if len(lines) <= 4:
            break
    lines = lines[:5]
    line_height = int(size * 1.16)
    top = 600 - line_height * len(lines) // 2
    for index, line in enumerate(lines):
        y = top + index * line_height
        width = font.getlength(line)
        # Each line on its own plate, like a newspaper strap.
        draw.rectangle((MARGIN - 6, y - 6, MARGIN + width + 34, y + line_height - 6), fill=(255, 196, 46, 255) if index == 0 else (12, 14, 34, 240))
        draw.text((MARGIN + 14, y), line, font=font, fill=(12, 14, 34) if index == 0 else "white")
    return layer


def _banner_image(text: str, desk: str) -> Image.Image:
    """The lower third: a coloured edge and a white plate, sized to its text, on its own transparent strip."""
    font = _font(60, 800)
    lines = _wrap(text, font, WIDTH - 2 * MARGIN - 70)[:2]
    line_height = 74
    height = line_height * len(lines) + 36
    width = int(max(font.getlength(line) for line in lines)) + 70
    strip = Image.new("RGBA", (width + 24, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(strip)
    draw.rectangle((0, 0, 24, height), fill=(*DESK_COLOUR[desk], 255))
    draw.rectangle((24, 0, width + 24, height), fill=(250, 250, 252, 255))
    for index, line in enumerate(lines):
        draw.text((58, 14 + index * line_height), line, font=font, fill=(12, 14, 34))
    return strip


def _ticker_strip(headlines: list[str], desk: str) -> Image.Image:
    font = _font(36, 600)
    text = "     •     ".join(headlines) + "     •     "
    width = max(WIDTH, int(font.getlength(text)) + 1)
    strip = Image.new("RGB", (width, TICKER_HEIGHT), (12, 14, 34))
    ImageDraw.Draw(strip).text((0, TICKER_HEIGHT // 2), text, font=font, fill="white", anchor="lm")
    return strip


def _ticker_label(desk: str) -> Image.Image:
    label = Image.new("RGB", (220, TICKER_HEIGHT), DESK_COLOUR[desk])
    ImageDraw.Draw(label).text((110, TICKER_HEIGHT // 2), "HEADLINES", font=_font(32, 800), fill="white", anchor="mm")
    return label


def _end_card() -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.text((WIDTH / 2, 760), "Full story, with sources", font=_font(58, 600), fill="white", anchor="mm")
    draw.text((WIDTH / 2, 870), "aiblog.fun", font=_font(120, 900), fill=HIGHLIGHT, anchor="mm")
    draw.text((WIDTH / 2, 985), "New edition every evening, 9 pm IST", font=_font(42, 500), fill=(225, 225, 235), anchor="mm")
    return layer


def _caption_chunks(words: list[Word]) -> list[list[Word]]:
    """Groups words into short pages: at most three words, split after a pause."""
    chunks: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        too_long = len(current) >= 3 or sum(len(w.text) + 1 for w in current) + len(word.text) > 20
        paused = bool(current) and word.start - current[-1].end > 0.25
        if current and (too_long or paused):
            chunks.append(current)
            current = []
        current.append(word)
    return chunks + ([current] if current else [])


def _caption_layer(chunk: list[Word], active: int) -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = _font(84)
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
    line_height = 102
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
    """Scales to cover the frame with room left over for movement."""
    return ImageOps.fit(image, (int(WIDTH * 1.25), int(HEIGHT * 1.25)), Image.Resampling.LANCZOS)


def _moving_frame(source: Image.Image, index: int, progress: float) -> Image.Image:
    """Steady push and drift; alternate scenes reverse so consecutive shots do not feel the same."""
    zoom = 1.0 + 0.2 * (progress if index % 2 == 0 else 1 - progress)
    width, height = source.width / zoom, source.height / zoom
    spare_x, spare_y = source.width - width, source.height - height
    drift = 0.5 + (0.35 if index % 4 < 2 else -0.35) * (progress - 0.5)
    left, top = spare_x * drift, spare_y * 0.45
    return source.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR, box=(left, top, left + width, top + height))


def render_video(images: list[Image.Image], scenes: list[SpokenScene], audio: Path, headline: str, banners: list[str], ticker: list[str], desk: str, output: Path) -> None:
    """`images` and `banners` pair with the narrated scenes; the final scene is the spoken sign-off, shown as the end card."""
    sources = [_prepare(image) for image in images]
    base, headline_layer, end_card = _base_layer(desk), _headline_layer(headline), _end_card()
    banner_images = [_banner_image(text, desk) if text else None for text in banners]
    strip = _ticker_strip(ticker or [headline], desk)
    label = _ticker_label(desk)
    last_content = len(scenes) - 2
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
                # The loudness phones and YouTube expect, so it does not sound thin next to other Shorts.
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100",
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
                is_end = current > last_content
                image_index = min(current, last_content)
                span = scenes[image_index].end - scenes[image_index].start
                if is_end:
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

                show_headline = now < HEADLINE_SECONDS
                key = (is_end, show_headline, page_cursor if page else None, active)
                if key != cached_key:
                    # The end card dims the picture but not the base layer, so the AI disclosure stays legible to the last frame.
                    cached_layer = Image.new("RGBA", (WIDTH, HEIGHT), (6, 8, 26, 205) if is_end else (0, 0, 0, 0))
                    cached_layer.alpha_composite(base)
                    if is_end:
                        cached_layer.alpha_composite(end_card)
                    if show_headline:
                        cached_layer.alpha_composite(headline_layer)
                    if page and not is_end:
                        cached_layer.alpha_composite(_caption_layer(page[1], active))
                    cached_key = key
                frame.paste(cached_layer, (0, 0), cached_layer)

                # The banner waits for the headline to clear, then slides in from the left.
                banner = banner_images[current] if not is_end and current < len(banner_images) else None
                if banner:
                    entered = max(scenes[current].start, HEADLINE_SECONDS if current == 0 else 0.0)
                    if now >= entered:
                        slide = min(1.0, (now - entered) / SLIDE_SECONDS)
                        eased = 1 - (1 - slide) ** 3
                        frame.paste(banner, (int(-banner.width * (1 - eased)), BANNER_TOP), banner)

                offset = int(now * TICKER_SPEED) % strip.width
                row = Image.new("RGB", (WIDTH, TICKER_HEIGHT))
                row.paste(strip, (-offset, 0))
                if strip.width - offset < WIDTH:
                    row.paste(strip, (strip.width - offset, 0))
                row.paste(label, (0, 0))
                frame.paste(row, (0, TICKER_TOP))

                ImageDraw.Draw(frame).rectangle((0, 0, int(WIDTH * now / duration), 9), fill=HIGHLIGHT)
                encoder.stdin.write(frame.tobytes())
            encoder.stdin.close()
        except BrokenPipeError:
            pass
        if encoder.wait() != 0:
            log.seek(0)
            raise RuntimeError(f"ffmpeg failed: {log.read().decode(errors='replace')[-800:]}")
