import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"
FONT_PATH = ROOT / "assets" / "fonts" / "SchibstedGrotesk.ttf"
USER_AGENT = "TheDailyCircuit-Shorts/1.0 (+https://aiblog.fun)"


def load_dotenv(path: Path = ROOT / ".env") -> None:
    """Reads KEY=value lines into the environment. Real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def env(name: str, default: str = "") -> str:
    # GitHub Actions passes unset secrets and variables as empty strings.
    return os.environ.get(name) or default


def site_url() -> str:
    return env("SITE_URL", "https://aiblog.fun").rstrip("/")
