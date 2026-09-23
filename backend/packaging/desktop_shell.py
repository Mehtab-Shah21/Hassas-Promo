"""The native desktop window the user actually clicks on (Desktop/Start Menu
shortcut). This is deliberately NOT the FastAPI backend -- it's a thin
pywebview shell (Windows' built-in WebView2 engine, so no bundled Chromium)
that just points a native window at the real app:

- Server / Standalone install: the backend already runs as its own process
  (started at boot by a Scheduled Task -- see the Inno Setup script), so this
  just opens http://127.0.0.1:<port>/, which the backend serves the built
  frontend AND the API from (same origin -- see app/main.py's spa_fallback
  and api/client.ts's RUNTIME_URL). If the backend isn't up yet (PC just
  booted, or the task didn't fire), this launches it directly as a fallback
  so "click the icon" always works regardless of the scheduled task.
- Client Only install: there is no local backend on this PC at all. The
  built frontend still needs a real http:// origin to run in (WebView2
  handles fetch/localStorage differently under file://), so this starts a
  tiny local static file server for the bundled frontend_dist folder and
  points the window at that instead. The app's own existing "Connect to your
  office server" screen (ServerConfigGate) then asks for the admin PC's LAN
  address on first run, exactly as it already does when opened in a normal
  browser -- nothing about that flow changes for being inside a native
  window instead of Chrome/Edge.

Config written by the installer to shell-config.json next to the database:
  {"mode": "server", "port": 8000, "backend_exe": "C:\\...\\ProInvoicingServer.exe"}
  {"mode": "client"}
"""
import functools
import http.server
import json
import logging
import os
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
from pathlib import Path

import webview

APP_TITLE = "PRO Invoicing"

_LOG_PATH = Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "ProInvoicing" / "desktop-shell.log"
try:
    _LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=str(_LOG_PATH), level=logging.INFO, format="%(asctime)s %(message)s")
except OSError:
    logging.basicConfig(level=logging.INFO)


def resource_dir() -> Path:
    """Bundled read-only files (frontend_dist for the client-only role) --
    mirrors app/core/config.py's resource_dir() logic for a frozen build."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def data_dir() -> Path:
    base = Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "ProInvoicing"
    base.mkdir(parents=True, exist_ok=True)
    return base


def load_config() -> dict:
    try:
        return json.loads((data_dir() / "shell-config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"mode": "server", "port": 8000}


def backend_healthy(url: str, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/api/health", timeout=timeout) as resp:
            return resp.status == 200
    except OSError:
        return False


def wait_for_backend(url: str, timeout: float = 25.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if backend_healthy(url):
            return True
        time.sleep(0.5)
    return False


def ensure_backend_running(cfg: dict, url: str) -> None:
    """Belt-and-braces: the backend is expected to already be running (a
    Scheduled Task starts it at boot), but if it isn't -- the task didn't
    fire, someone stopped it, this is the very first launch right after
    install -- start it directly so the app works regardless.

    backend_exe points at run-backend.bat (written by the installer, sets
    HOST/PORT env vars before launching ProInvoicingServer.exe -- see
    installer/pro_invoicing.iss), not the .exe directly, so this fallback
    launch honors the same host/port the admin chose during setup. A .bat
    needs a shell to execute, hence shell=True here specifically.
    """
    if backend_healthy(url):
        return
    exe = cfg.get("backend_exe")
    if exe and Path(exe).is_file():
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.Popen(f'"{exe}"', shell=True, creationflags=creationflags, close_fds=True)
    wait_for_backend(url)


def find_free_port() -> int:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve_static_dir(directory: Path, port: int) -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True, name="static-frontend").start()


_LOADING_HTML = """
<html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0;background:#0f2038;display:flex;align-items:center;
    justify-content:center;font-family:Segoe UI,Arial,sans-serif;color:#eaf2ff}
  .box{text-align:center}
  .spinner{width:40px;height:40px;margin:0 auto 16px;border-radius:50%;
    border:4px solid rgba(255,255,255,.25);border-top-color:#47bfff;
    animation:spin 0.9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
  <div class="box"><div class="spinner"></div><div>Starting PRO Invoicing&hellip;</div></div>
</body></html>
"""


def main() -> None:
    cfg = load_config()
    window = webview.create_window(APP_TITLE, html=_LOADING_HTML, width=1360, height=860, min_size=(1000, 650))

    def _boot():
        try:
            logging.info("boot: cfg=%s", cfg)
            if cfg.get("mode") == "client":
                port = find_free_port()
                serve_static_dir(resource_dir() / "frontend_dist", port)
                url = f"http://127.0.0.1:{port}/"
                wait_for_backend(url, timeout=10)  # the static server itself, not a real backend
            else:
                port = cfg.get("port", 8000)
                url = f"http://127.0.0.1:{port}/"
                ensure_backend_running(cfg, url)
            logging.info("boot: loading %s", url)
            window.load_url(url)
        except Exception:
            logging.error("boot failed:\n%s", traceback.format_exc())

    webview.start(_boot, private_mode=False)


if __name__ == "__main__":
    main()
