import base64
import io
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from PIL import Image

from shorts import images, script, source, voice, youtube
from shorts.script import Scene
from shorts.source import Article, FeedItem

NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)
PAGE = """<html><img src="/api/images/hero-1" alt="x"/>
<script type="application/ld+json">[{"@type":"NewsArticle","headline":"SEBI Approves \\u2011 Net Settlement","description":"A short summary.","keywords":"SEBI, Mutual Funds"}]</script>
<section id="key-facts"><ul><li><span></span><span>The rule starts on April 1, 2027.<a href="#source-1" class="cite">[<!-- -->1<!-- -->]</a></span></li></ul></section>
<div class="prose-article"><div><p>Body &amp; detail.<a href="#s" class="cite">[1]</a></p></div></div>
<img src="/api/images/related-2"/></html>"""


def article(**overrides):
    values = dict(
        title="OpenAI ships GIFs in ChatGPT",
        url="https://aiblog.fun/ai/gifs",
        summary="OpenAI added GIF creation.",
        desk="ai",
        key_facts=["Users generate more than 4 billion images per week, up from 3 billion."],
    )
    return Article(**{**values, **overrides})


def valid_scenes(text="OpenAI added GIF creation to ChatGPT."):
    filler = " ".join(["users can edit the frames"] * 12)
    return [Scene(text, "a"), Scene(filler + ".", "b"), Scene("Users generate more than 4 billion images per week.", "c")]


def item(url, desk_category="AI News", age_hours=1):
    return FeedItem("t", url, desk_category, NOW - timedelta(hours=age_hours))


class ChooseItem(unittest.TestCase):
    def test_skips_stories_that_already_have_a_short(self):
        items = [item("https://aiblog.fun/ai/a"), item("https://aiblog.fun/ai/b", age_hours=2)]
        self.assertEqual(source.choose_item(items, ["https://aiblog.fun/ai/a"], 72, NOW).url, "https://aiblog.fun/ai/b")

    def test_skips_old_stories(self):
        self.assertIsNone(source.choose_item([item("https://aiblog.fun/ai/a", age_hours=100)], [], 72, NOW))

    def test_skips_routine_stories(self):
        routine = FeedItem("Reserve Bank of India Releases Money Market Operations Data", "https://aiblog.fun/markets/r", "Indian Markets", NOW)
        news = FeedItem("SEBI Revises Currency Derivatives Limits", "https://aiblog.fun/markets/n", "Indian Markets", NOW - timedelta(hours=2))
        self.assertEqual(source.choose_item([routine, news], [], 72, NOW).url, "https://aiblog.fun/markets/n")

    def test_alternates_desks(self):
        items = [item("https://aiblog.fun/ai/new"), item("https://aiblog.fun/markets/m", "Indian Markets", 5)]
        self.assertEqual(source.choose_item(items, ["https://aiblog.fun/ai/old"], 72, NOW).url, "https://aiblog.fun/markets/m")

    def test_falls_back_to_same_desk_when_other_is_empty(self):
        items = [item("https://aiblog.fun/ai/new")]
        self.assertEqual(source.choose_item(items, ["https://aiblog.fun/ai/old"], 72, NOW).url, "https://aiblog.fun/ai/new")


class ParseArticle(unittest.TestCase):
    def test_extracts_text_without_citations_and_only_the_own_image(self):
        parsed = source.parse_article(PAGE, "https://aiblog.fun/markets/x", "markets")
        self.assertEqual(parsed.title, "SEBI Approves - Net Settlement")
        self.assertEqual(parsed.key_facts, ["The rule starts on April 1, 2027."])
        self.assertEqual(parsed.paragraphs, ["Body & detail."])
        self.assertEqual(parsed.hero_url, "https://aiblog.fun/api/images/hero-1")

    def test_missing_structured_data_is_an_error(self):
        with self.assertRaises(ValueError):
            source.parse_article("<html></html>", "https://aiblog.fun/ai/x", "ai")


class ScriptChecks(unittest.TestCase):
    def test_accepts_a_faithful_draft(self):
        self.assertEqual(script.problems(valid_scenes(), article()), [])

    def test_rejects_invented_figures(self):
        scenes = valid_scenes("OpenAI added GIF creation for 900 million users.")
        self.assertTrue(any("900" in p for p in script.problems(scenes, article())))

    def test_rejects_invented_names(self):
        scenes = valid_scenes("OpenAI and Anthropic added GIF creation.")
        self.assertTrue(any("Anthropic" in p for p in script.problems(scenes, article())))

    def test_rejects_investment_advice(self):
        scenes = valid_scenes("Investors should buy OpenAI now.")
        self.assertTrue(any("advice" in p for p in script.problems(scenes, article())))

    def test_rejects_wrong_length(self):
        self.assertTrue(script.problems([Scene("Too short.", "a")] * 3, article()))

    def test_bad_llm_draft_falls_through_to_key_facts(self):
        bad = '{"scenes": [{"narration": "Made up 999 figure.", "image_subject": "x"}]}'
        with mock.patch.object(script, "_providers", return_value=[("fake", lambda _p: bad)]):
            result = script.write_script(article())
        self.assertEqual(result.author, "key-facts")
        self.assertEqual(result.scenes[0].narration, "OpenAI added GIF creation.")

    def test_good_llm_draft_is_used_even_when_wrapped_in_a_code_fence(self):
        import json

        good = "```json\n" + json.dumps({"scenes": [{"narration": s.narration, "image_subject": s.image_subject} for s in valid_scenes()]}) + "\n```"
        with mock.patch.object(script, "_providers", return_value=[("fake", lambda _p: good)]):
            self.assertEqual(script.write_script(article()).author, "fake")

    def test_only_free_openrouter_models_are_called(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "k", "OPENROUTER_MODELS": "a/paid,b/free:free"}, clear=True):
            self.assertEqual([n for n, _ in script._providers()], ["openrouter/b/free:free"])


class Images(unittest.TestCase):
    def test_prompt_rephrases_words_that_summon_figures(self):
        prompt = images.photo_prompt("a CEO beside a humanoid robot").split(". ")[0]
        for word in ("CEO", "humanoid", "robot "):
            self.assertNotIn(word, prompt)

    def test_generation_failure_uses_the_article_image(self):
        hero = io.BytesIO()
        Image.new("RGB", (8, 8), "red").save(hero, "PNG")
        env = {"CLOUDFLARE_ACCOUNT_ID": "a", "CLOUDFLARE_AI_TOKEN": "t"}
        with mock.patch.dict(os.environ, env), mock.patch.object(images, "fetch_bytes", return_value=hero.getvalue()), mock.patch.object(images.requests, "post", side_effect=OSError("down")):
            result, made_by = images.scene_images(["x", "y"], article(hero_url="https://aiblog.fun/api/images/1"))
        self.assertEqual(result[0].getpixel((0, 0)), (255, 0, 0))
        self.assertIn("(0/2)", made_by)

    def test_generated_image_is_decoded(self):
        png = io.BytesIO()
        Image.new("RGB", (8, 8), "blue").save(png, "PNG")
        res = mock.Mock(json=lambda: {"success": True, "result": {"image": base64.b64encode(png.getvalue()).decode()}})
        with mock.patch.object(images.requests, "post", return_value=res) as post:
            image = images._cloudflare("p", "acct", "tok", "@cf/m")
        self.assertEqual(image.getpixel((0, 0)), (0, 0, 255))
        self.assertNotIn("seed", post.call_args.kwargs["json"])


class Voice(unittest.TestCase):
    def test_sebi_is_respoken_and_restored_in_captions(self):
        self.assertEqual(voice._speakable("SEBI's rule"), "Sebi's rule")
        self.assertEqual(voice.displayable("Sebi’s"), "SEBI’s")
        self.assertEqual(voice.displayable("Sebi"), "SEBI")


class Metadata(unittest.TestCase):
    def test_title_fits_and_keeps_the_shorts_tag(self):
        snippet = youtube.build_metadata(article(title="A <very> long headline " * 10), "public")["snippet"]
        self.assertLessEqual(len(snippet["title"]), 100)
        self.assertTrue(snippet["title"].endswith("#Shorts"))
        self.assertNotIn("<", snippet["title"])

    def test_discloses_ai_and_links_the_article(self):
        meta = youtube.build_metadata(article(), "private")
        self.assertTrue(meta["status"]["containsSyntheticMedia"])
        self.assertEqual(meta["status"]["privacyStatus"], "private")
        self.assertIn("https://aiblog.fun/ai/gifs", meta["snippet"]["description"])

    def test_market_stories_say_not_advice(self):
        self.assertIn("not investment advice", youtube.build_metadata(article(desk="markets"), "public")["snippet"]["description"])
        self.assertNotIn("not investment advice", youtube.build_metadata(article(), "public")["snippet"]["description"])


def response(status=200, body=None, headers=None):
    res = mock.Mock(status_code=status, ok=200 <= status < 300, headers=headers or {}, text=str(body))
    res.json = lambda: body
    return res


class Upload(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.video = Path(self.dir.name) / "v.mp4"
        self.video.write_bytes(b"0123456789")
        patcher = mock.patch.object(youtube.time, "sleep")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.dir.cleanup)

    def run_upload(self, puts):
        sent = []

        def put(url, data=None, headers=None, **_):
            sent.append((headers, data.read() if data else b""))
            result = puts.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with mock.patch.object(youtube.requests, "post", return_value=response(200, {}, {"Location": "https://upload/session"})), mock.patch.object(youtube.requests, "put", side_effect=put):
            return youtube.upload(self.video, {}, "token"), sent

    def test_plain_upload(self):
        video_id, sent = self.run_upload([response(200, {"id": "abc"})])
        self.assertEqual(video_id, "abc")
        self.assertEqual(sent[0][1], b"0123456789")

    def test_resumes_from_the_byte_youtube_reports(self):
        drop = youtube.requests.ConnectionError("reset")
        video_id, sent = self.run_upload([drop, response(308, None, {"Range": "bytes=0-3"}), response(200, {"id": "abc"})])
        self.assertEqual(video_id, "abc")
        self.assertEqual(sent[1][0]["Content-Range"], "bytes */10")
        self.assertEqual(sent[2][0]["Content-Range"], "bytes 4-9/10")
        self.assertEqual(sent[2][1], b"456789")

    def test_no_duplicate_when_an_interrupted_upload_had_actually_finished(self):
        video_id, sent = self.run_upload([youtube.requests.ConnectionError("reset"), response(200, {"id": "abc"})])
        self.assertEqual(video_id, "abc")
        self.assertEqual(len(sent), 2)

    def test_client_errors_are_not_retried(self):
        with self.assertRaisesRegex(RuntimeError, "403"):
            self.run_upload([response(403, {"error": "quota"})])


class PastUploads(unittest.TestCase):
    def test_reads_article_links_from_descriptions(self):
        channels = response(200, {"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UU1"}}}]})
        items = response(200, {"items": [{"snippet": {"description": "x\nFull story and sources: https://aiblog.fun/ai/a\nmore"}}, {"snippet": {"description": "unrelated"}}]})
        with mock.patch.object(youtube.requests, "get", side_effect=[channels, items]):
            self.assertEqual(youtube.uploaded_article_urls("t"), ["https://aiblog.fun/ai/a"])

    def test_api_failure_stops_the_run_rather_than_risking_a_duplicate(self):
        with mock.patch.object(youtube.requests, "get", return_value=response(500, {"e": 1})):
            with self.assertRaises(RuntimeError):
                youtube.uploaded_article_urls("t")


if __name__ == "__main__":
    unittest.main()
