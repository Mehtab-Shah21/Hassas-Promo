# Deployment — Prompt 14

Status: **scaffolded, not fully executed or validated**. This is real,
working code (the parts that could be tested without installing a system
service or building the frontend installer were tested — see below), but
nobody has run the complete "install on PC A, install on PC B, both talk to
each other over LAN" flow. Treat this as a strong starting point, not a
finished, verified deployment pipeline.

Per `PROMPT-SEQUENCE.md`, this stage is meant to start only after the app
works end-to-end in a browser, which hasn't been confirmed yet (see
`QUESTIONS.md` #6). It's scaffolded here anyway because you asked me to keep
building without stopping — treat everything below as a draft to review
before actually running it on a real machine, not as done.

---

## Decision: SQLite for the default install

CLAUDE.md §3 leaves this open ("SQLite or Postgres via a single
`DATABASE_URL` env var"). Going with **SQLite** as the shipped default —
it's the "simplest single-PC install" case CLAUDE.md itself names, matches
what's been used for all local dev/testing so far, and the whole app was
built to be portable through SQLAlchemy already so switching to Postgres
later is just changing `DATABASE_URL` (nothing else changes) if concurrent
multi-writer load ever demands it. Backup/Restore (Settings → Backup &
Restore, built in this same pass) only supports SQLite for now — a Postgres
deployment would need `pg_dump`/`pg_restore` wired in separately.

---

## What's built and tested

- **`app/core/config.py`** now centralizes all filesystem paths instead of
  each router computing its own `Path(__file__)...`. `resource_dir()`
  returns the backend root (read-only bundled resources — templates,
  alembic) and adapts automatically between dev (`backend/`) and a
  PyInstaller bundle (`sys._MEIPASS`). `settings.upload_dir` /
  `settings.database_url` point at a writable data directory that's
  `backend/` in dev (unchanged behavior) and `%PROGRAMDATA%\ProInvoicing\`
  when packaged (`sys.frozen` — the standard writable-by-service location on
  Windows, since a service may not have write access to Program Files).
  **Verified**: full regression pass after this refactor — uploads,
  templates, backups, and the DB all still resolve to the same place in dev
  as before, nothing broke.
- **`packaging/run_server.py`** — the packaged entry point. Runs Alembic
  migrations to head, then the (idempotent) seed script, then starts
  uvicorn on `settings.host`/`settings.port`. **Verified**: ran
  `run_migrations()` + `maybe_seed()` directly against the real dev DB,
  both work correctly with the new path scheme.
- **`packaging/pro_invoicing.spec`** — PyInstaller spec bundling
  `app/templates` and `alembic/` as data files, plus the uvicorn/passlib
  hidden-imports PyInstaller usually needs help finding. **Not run** — a
  full PyInstaller build wasn't attempted (see risks below).
- **`packaging/windows_service.py`** — a pywin32 `ServiceFramework`
  wrapper. **Verified**: imports cleanly, `pywin32` installed and working in
  the dev venv. **Not run** — installing a Windows service is a system-level
  change (`sc create`, needs Administrator) that wasn't executed
  automatically; see "Manual steps" below.
- **Frontend `ServerConfigGate`** (`frontend/src/components/ServerConfigGate.tsx`)
  — on first run, if there's no build-time `VITE_API_URL` and nothing saved
  in `localStorage`, shows a "Connect to your office server" screen that
  tests the address against `/api/health` before saving it. This is the
  employee-install flavor CLAUDE.md/Prompt 14 describes ("asks for the admin
  PC address on first run"). **Verified**: confirmed `VITE_API_URL` gets
  baked into the production bundle when set (admin/dev build), which means
  the gate never shows for that build; an employee build is just the same
  `npm run build` with that env var *unset*.
- **Backup & Restore** (Settings tab + `/api/backup/*`, logic in
  `app/services/backup.py`) — automatic backups on a schedule with catch-up
  after startup and retention, manual "Back up now", download, restore from
  the backup folder or from an uploaded file. Each backup is one .zip with a
  consistent database snapshot, every uploaded file and a manifest. A restore
  validates the file, saves a "before restore" backup of the current data,
  restores in place without a restart, migrates older backups forward, and
  signs everyone out. Defaults to a `backups` folder beside the database.

## What's NOT built / explicitly out of scope right now

- **Actually running a PyInstaller build.** No longer expected to be a hard
  case — the PDF engine was switched from WeasyPrint to xhtml2pdf (pure
  Python, no native GTK/Pango runtime, see `QUESTIONS.md` #4), specifically
  because it bundles cleanly into a PyInstaller exe. Still untested for real
  since no full build has been run yet — worth confirming once someone does.
- **Installing the Windows service.** `sc create`, `sc failure` (auto-restart
  on crash), and the firewall rule are all system-level, hard-to-reverse
  actions requiring Administrator — deliberately left as manual steps below
  rather than something I ran myself.
- **Tauri desktop wrapper.** Needs a Rust/Cargo toolchain, which isn't
  installed in this environment and is a heavy thing to install unilaterally.
  Not scaffolded at all yet — CLAUDE.md's fallback is fine without it too
  (the web frontend works in any browser pointed at the server), Tauri is
  purely for a native-feeling desktop shell / installer experience.
- **Code signing.** CLAUDE.md marks this optional. Not started.

---

## Manual steps (run these yourself — none of this was executed for you)

### 1. Build the backend .exe

```powershell
cd backend
.venv\Scripts\pip install -r packaging\requirements-build.txt
.venv\Scripts\pyinstaller packaging\pro_invoicing.spec --distpath dist --workpath build
# Output: backend\dist\ProInvoicingServer\ProInvoicingServer.exe
```

Test it manually first (`ProInvoicingServer.exe`, check `http://localhost:8000/api/health`)
before wiring it into a service.

### 2. Install as a Windows service (Administrator PowerShell)

Using [NSSM](https://nssm.cc/) is the least error-prone way to wrap an
arbitrary .exe as a service with auto-restart — simpler than the
`pywin32`-based `windows_service.py` for a packaged (non-Python-installed)
target machine:

```powershell
nssm install ProInvoicingServer "C:\path\to\ProInvoicingServer.exe"
nssm set ProInvoicingServer AppEnvironmentExtra HOST=0.0.0.0 PORT=8000
nssm set ProInvoicingServer Start SERVICE_AUTO_START
nssm start ProInvoicingServer
```

`HOST=0.0.0.0` is what makes it reachable from other PCs on the LAN, not
just `localhost` — the default in `config.py` is `127.0.0.1` (safe/dev
default) specifically so this has to be an explicit opt-in on the real
install.

### 3. Open the firewall port (Administrator PowerShell)

```powershell
New-NetFirewallRule -DisplayName "PRO Invoicing Server" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

### 4. Employee PCs

Just the built frontend (`npm run build` **without** `VITE_API_URL` set, or
delete `frontend/.env` for that build only) pointed at a static file host or
opened via `file://` / a simple `npx serve dist`. First launch shows the
`ServerConfigGate` screen — enter the admin PC's LAN IP and port (e.g.
`192.168.1.50:8000`).

### 5. Backups

Nothing to schedule — the server backs itself up (Settings → Backup &
Restore; on by default, once a day, keeping the latest 14 automatic
backups). If the PC was off when a backup was due, one runs about 90 seconds
after the server next starts. For protection against disk failure, point the
backup folder at a USB drive, network share or cloud-synced folder.
