# YouTube Shorts automation

Turns stories from [aiblog.fun](https://aiblog.fun) into vertical Shorts and uploads them to YouTube, twice a day, at no cost.

```
aiblog.fun RSS + article page     picks the newest story without a Short, alternating AI and markets,
                                  skipping routine data releases and notices (`ROUTINE` in shorts/source.py)
        ↓
Script    Gemini → Groq → OpenRouter free models. Every figure and name must appear in the article,
          otherwise the next provider tries. Last resort: the article's own key facts.
        ↓
Images    Cloudflare Workers AI (FLUX), one per scene, objects and places only.
          Fallback: the article's own image.
        ↓
Voice     Microsoft neural voice through edge-tts (no key), with word timings
        ↓
Video     1080×1920 with slow camera moves, word-by-word captions and an end card (Pillow + ffmpeg)
        ↓
Upload    YouTube Data API. AI use is stated on screen and in the description, and the upload
          requests YouTube's altered-content label (check it in YouTube Studio; see below)
```

The channel's own upload list is the record of what has been published: each description links its article, so nothing needs committing and a story is not posted twice. If that list cannot be read, the run stops rather than risk a duplicate.

## Cost

| Part | Service | Free limit | Needs a card? |
|---|---|---|---|
| Scheduling and rendering | GitHub Actions | Unlimited minutes on public repositories | No |
| Script | Gemini, Groq, OpenRouter `:free` models | Daily free tiers; two Shorts use very little | No |
| Images | Cloudflare Workers AI | Free daily allocation | No |
| Voice | edge-tts | No published limit, unofficial | No |
| Upload | YouTube Data API | 100 uploads a day | No |

Paid providers are never called, even when their keys exist. OpenRouter models are only used if the name ends in `:free`.

## Setup (about 10 minutes, once)

### 1. Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create or choose a project, then enable **YouTube Data API v3**.
2. Under **Google Auth Platform → Clients**, create a client of type **Desktop app**. If you already have a **Web** client, add `http://localhost:8765/` to its authorised redirect URIs instead.
3. Under **Audience**, press **Publish app** so its status is **In production**. **Do not skip this:** while it says Testing, Google expires the sign-in after 7 days and uploads stop. No verification is needed for your own use; you will just see an "unverified app" warning once, when signing in. Choose Advanced → Continue.

### 2. Sign in

```bash
cd youtube-shorts
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python auth.py --github
```

Pick the channel the Shorts should go to. This saves the credentials to `youtube-shorts/.env` (never committed) and stores them as repository secrets.

### 3. Try it

In GitHub: **Actions → YouTube Shorts → Run workflow**. The default is a **private** upload, so you can review it in YouTube Studio first. Scheduled runs publish publicly.

Your first upload may need YouTube's phone verification on the channel if the account has never uploaded.

## Everyday use

```bash
.venv/bin/python run.py --dry-run                 # render only, into output/<slug>/
.venv/bin/python run.py --url <article-url> --privacy unlisted
.venv/bin/python -m unittest discover -s tests -t .
```

- **Public or private:** the repository variable `YOUTUBE_PRIVACY` sets what scheduled runs do (`private` or `public`). It defaults to `public` when unset. A private Short still counts as done for its story, so publish it from YouTube Studio if you want it seen.
- **Stop completely:** Actions → YouTube Shorts → ⋯ → Disable workflow.
- **Change the schedule:** the `cron` lines in `.github/workflows/youtube-shorts.yml`. Each run makes one Short.
- **Change the voice:** `TTS_VOICE` (`en-IN-NeerjaNeural`, `en-IN-PrabhatNeural`).

## What can go wrong

- **Altered-content label missing:** on the first test upload the API accepted `containsSyntheticMedia: true` but returned no value when read back. Check the video's Altered content setting in YouTube Studio; the on-screen and description disclosures do not depend on it.
- **`invalid_grant`** in the log: the consent screen is still in Testing, or access was revoked. Fix step 1.3 and run `auth.py --github` again.
- **Voice failures:** edge-tts relies on an unofficial Microsoft endpoint, which can change or block without notice. Run `pip install -U edge-tts` first; if it stays down, the voice is the one part to swap (in `shorts/voice.py`).
- **Scheduled runs stop after 60 days:** GitHub pauses schedules when a public repository has no commits for 60 days. Any commit, or re-enabling the workflow, restarts them.
- **Monetisation:** YouTube can decline to monetise mass-produced or templated channels. Uploading is allowed, but earning is not guaranteed. Keeping the rate low and adding original commentary now and then helps.
