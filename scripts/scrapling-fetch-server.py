#!/usr/bin/env python3
"""
HTTP bridge: Scrapling → JSON `{ "html": "..." }` for Nativz Cortex `SCRAPLING_FETCH_URL`.

Setup:
  pip install -r scripts/scrapling-fetch-server-requirements.txt
  scrapling install

Run:
  SCRAPLING_FETCH_SECRET=yoursecret python3 scripts/scrapling-fetch-server.py

Cortex .env.local:
  SCRAPLING_FETCH_URL=http://127.0.0.1:8765/fetch
  SCRAPLING_FETCH_SECRET=yoursecret
  SCRAPLING_FETCH_MODE=dynamic   # fetcher | stealthy | dynamic

POST /fetch  Content-Type: application/json
  { "url": "https://example.com", "mode": "dynamic" }   # mode optional
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse


PORT = int(os.environ.get("PORT", "8765"))


def fetch_html(url: str, mode: str) -> str:
    mode = (mode or "dynamic").strip().lower()
    if mode == "fetcher":
        from scrapling.fetchers import Fetcher

        page = Fetcher.get(url)
    elif mode == "stealthy":
        from scrapling.fetchers import StealthyFetcher

        page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    else:
        from scrapling.fetchers import DynamicFetcher

        page = DynamicFetcher.fetch(url, headless=True, network_idle=True)

    body: bytes = page.body
    return body.decode("utf-8", errors="replace")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/fetch":
            self._send(404, b'{"error":"not found"}')
            return

        secret = os.environ.get("SCRAPLING_FETCH_SECRET", "").strip()
        if secret:
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {secret}":
                self._send(401, b'{"error":"unauthorized"}')
                return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send(400, b'{"error":"bad content-length"}')
            return

        raw = self.rfile.read(min(length, 2_000_000))
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send(400, b'{"error":"invalid json"}')
            return

        url = data.get("url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            self._send(400, b'{"error":"invalid url"}')
            return

        parsed = urlparse(url)
        if parsed.hostname is None:
            self._send(400, b'{"error":"invalid url"}')
            return

        mode = data.get("mode")
        if mode is not None and not isinstance(mode, str):
            self._send(400, b'{"error":"mode must be string"}')
            return

        default_mode = os.environ.get("SCRAPLING_FETCH_MODE", "dynamic").strip().lower()
        use_mode = (mode or default_mode or "dynamic").lower()

        try:
            html = fetch_html(url, use_mode)
        except Exception as e:
            msg = json.dumps({"error": str(e)[:500]})
            self._send(502, msg.encode("utf-8"))
            return

        out = json.dumps({"html": html})
        self._send(200, out.encode("utf-8"))


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Scrapling fetch server on http://127.0.0.1:{PORT}/fetch", file=sys.stderr)
    server.serve_forever()


if __name__ == "__main__":
    main()
