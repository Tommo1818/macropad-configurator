#!/usr/bin/env python3
"""Serve the static WebHID app on localhost.

WebHID requires a secure context. https://... and http://localhost (or
127.0.0.1) count as secure, so this tiny stdlib server is enough for local use.
No third-party packages and no device access are needed here; the browser talks
to the macropad directly.
"""

from __future__ import annotations

import argparse
import http.server
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "docs"


def open_in_browser(url: str) -> None:
    """Prefer a Chromium browser; WebHID is not available in Firefox/Safari."""
    if sys.platform == "win32":
        candidates = [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        ]
        for candidate in candidates:
            if os.path.isfile(candidate):
                try:
                    subprocess.Popen([candidate, url])
                    return
                except OSError:
                    pass
    elif sys.platform == "darwin":
        try:
            subprocess.Popen(["open", "-a", "Google Chrome", url])
            return
        except OSError:
            pass
    else:
        for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
            candidate = shutil.which(name)
            if candidate:
                try:
                    subprocess.Popen([candidate, url])
                    return
                except OSError:
                    pass
    webbrowser.open(url)


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:  # noqa: N802
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # noqa: N802
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    if not (SITE / "index.html").is_file():
        raise SystemExit(f"Could not find {SITE / 'index.html'}")

    parser = argparse.ArgumentParser(description="Serve the macropad configurator")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    handler = partial(Handler, directory=str(SITE))
    server = None
    for port in range(args.port, args.port + 25):
        try:
            server = Server((args.host, port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit(f"Could not find a free port starting at {args.port}")

    server.verbose = args.verbose  # type: ignore[attr-defined]
    url = f"http://{args.host}:{server.server_address[1]}/"

    print()
    print("  Macropad Configurator")
    print("  ------------------------------------------------")
    print(f"  Open:  {url}")
    print("  Use Chrome or Edge on this computer.")
    print("  WebHID talks to the pad directly; no data leaves the browser.")
    print("  Press Ctrl+C to stop.")
    print()

    if not args.no_browser:
        threading.Timer(0.5, lambda: open_in_browser(url)).start()

    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        print("\n  Stopping...")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
