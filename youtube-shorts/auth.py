#!/usr/bin/env python3
"""One-time sign-in: opens Google's consent page and saves a long-lived refresh token to .env.

  python auth.py            sign in and save to youtube-shorts/.env (never committed)
  python auth.py --github   also store the three values as repository secrets, using the gh CLI
"""
from __future__ import annotations

import argparse
import getpass
import http.server
import secrets
import subprocess
import sys
import urllib.parse
import webbrowser

import requests

from shorts.config import ROOT, env, load_dotenv
from shorts.youtube import API, TOKEN_URL

PORT = 8765
REDIRECT_URI = f"http://localhost:{PORT}/"
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"


def wait_for_code(expected_state: str) -> str:
    result: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if query.get("state") != expected_state:
                self.send_error(400, "Unexpected request")
                return
            result.update(query)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Done. You can close this tab and return to the terminal.")

        def log_message(self, *_):
            pass

    with http.server.HTTPServer(("localhost", PORT), Handler) as server:
        while not result:
            server.handle_request()
    if "code" not in result:
        sys.exit(f"Google did not grant access: {result.get('error', 'unknown error')}")
    return result["code"]


def save_env(values: dict[str, str]) -> None:
    path = ROOT / ".env"
    lines = path.read_text().splitlines() if path.exists() else []
    kept = [line for line in lines if line.split("=", 1)[0].strip() not in values]
    path.write_text("\n".join([*kept, *(f"{k}={v}" for k, v in values.items())]) + "\n")
    path.chmod(0o600)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--github", action="store_true", help="also set repository secrets with gh")
    args = parser.parse_args()
    load_dotenv()

    client_id = env("YOUTUBE_CLIENT_ID") or input("OAuth client ID: ").strip()
    client_secret = env("YOUTUBE_CLIENT_SECRET") or getpass.getpass("OAuth client secret (hidden): ").strip()

    state = secrets.token_urlsafe(24)
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": SCOPES,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )
    print(f"Opening your browser. Choose the account and channel the Shorts should go to.\nIf it does not open, visit:\n{url}\n")
    webbrowser.open(url)
    code = wait_for_code(state)

    res = requests.post(
        TOKEN_URL,
        data={"code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": REDIRECT_URI, "grant_type": "authorization_code"},
        timeout=30,
    )
    if res.status_code != 200:
        sys.exit(f"Token exchange failed ({res.status_code}): {res.json().get('error_description', res.text[:200])}")
    tokens = res.json()
    if "refresh_token" not in tokens:
        sys.exit("Google returned no refresh token. Remove this app at myaccount.google.com/permissions and try again.")

    channel = requests.get(
        f"{API}/channels",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        params={"part": "snippet", "mine": "true"},
        timeout=30,
    ).json()
    items = channel.get("items") or []
    print(f"Signed in to channel: {items[0]['snippet']['title']}" if items else "Warning: this account has no YouTube channel yet.")

    values = {"YOUTUBE_CLIENT_ID": client_id, "YOUTUBE_CLIENT_SECRET": client_secret, "YOUTUBE_REFRESH_TOKEN": tokens["refresh_token"]}
    save_env(values)
    print(f"Saved to {ROOT / '.env'}")

    if args.github:
        for name, value in values.items():
            # Passed on stdin so the value never appears in a process listing.
            subprocess.run(["gh", "secret", "set", name], input=value, text=True, check=True)
        print("Repository secrets updated.")


if __name__ == "__main__":
    main()
