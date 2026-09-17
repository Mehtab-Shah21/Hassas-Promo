# PROGRESS.md — Build status (read this first after a context reset)

> This file tracks exactly where the build stands against `PROMPT-SEQUENCE.md`.
> Update it after every stage before stopping. If you're an AI picking this
> up cold: read `CLAUDE.md` first, then this file, then `QUESTIONS.md`
> (deferred decisions the user hasn't replied to yet), then resume at "Next
> up" below. The user asked to keep building continuously without stopping to
> ask questions — log them in QUESTIONS.md instead and keep going.

---

## Status: Prompts 1–13 DONE ✅. Prompt 14 (Deployment) scaffolded, not fully executed.

Every module has been smoke-tested via curl individually AND in multiple
combined regression passes hitting all modules end-to-end in sequence — all
return correct data and correct HTTP statuses, including after a mid-build
path-resolution refactor (see Prompt 14 section). Frontend type-checks and
builds clean (`npm run build`, zero errors) as of the last change. **Nothing
has been visually clicked through in a real browser** — no browser tool is
available in this environment. The user should click through before trusting
this is "done" in PROMPT-SEQUENCE.md's sense — every prompt's own "Done
when" criteria assume a human clicked it.

**Git: still zero commits.** Everything is uncommitted working tree. See
QUESTIONS.md #1.

---

## Repo layout

```
backend/          FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2
  app/
    core/          config.py (centralized paths — see Prompt 14 note),
                    db.py, security.py, deps.py
    models/        one file per table (15 tables total)
    schemas/       one file per module (Pydantic v2)
    routers/       one file per module, all mounted in main.py (86 routes)
    services/      numbering.py, invoice_calc.py, pdf.py, audit.py, csv_export.py
    templates/      document.html.jinja2 — the ONE shared invoice/quotation
                    template, fully config-driven by Design Studio
  alembic/versions/  10 migrations, all applied to the dev DB
  packaging/         Prompt 14 scaffolding — see its own section below
  uploads/           logo files land here (gitignored except .gitkeep)
  seed.py            idempotent: Main+IIM businesses, 5 feature flags, admin user
  .venv/             already has every runtime dependency installed
                      (pyinstaller/pywin32 also installed for packaging work,
                      not in requirements.txt — see packaging/requirements-build.txt)

frontend/         React 19 + Vite 8 + TS + Tailwind v4 + react-router-dom v7
  .env             VITE_API_URL=http://localhost:8000 — tracked in git
                    (not secret), this is what makes the admin/dev build skip
                    the employee-install server-setup screen
  src/
    api/            client.ts (axios; server URL now resolved at request time
                    via getServerUrl(), not baked in at module load — see
                    Prompt 14) + one file per module
    context/        AuthContext, BusinessContext, FeatureFlagsContext, NotificationsContext
    components/     shared: Modal, SearchCombobox, form/Field, ProtectedRoute,
                    AdminOnlyRoute, ServerConfigGate (Prompt 14)
    layouts/        AppShell (sidebar nav, gated by role + feature flag, badge count)
    features/       one folder per module — every nav item points to a real
                    page, nothing is a placeholder
```

Login: **MS_Software_Solutions / Invoicing@Hassas_2026**. Run instructions at the bottom.

---

## What's built — Prompts 1–13

All thirteen app-building prompts are done. Condensed summary (each was
individually smoke-tested when built, and re-verified in later combined
regression passes):

- **1 Foundation** — businesses (Main/IIM), users, feature_flags. JWT+PIN
  auth, role enforcement via FastAPI deps, app shell, BusinessContext,
  session auto-lock.
- **2 Settings** — Company Profile (+ logo upload), Regional, Invoice/
  Quotation Defaults, Modules & Features, Security (password/PIN/auto-lock),
  and now also **Backup & Restore** (that one actually belongs to Prompt 14,
  landed together with the rest of that work — see below).
- **3 Customers** — company/employee self-FK, validated (parent must be a
  company, no self-parenting, no nested employees).
- **4 Services** — categories + services, admin CRUD / employee read-only
  (403 verified).
- **5 Invoices** — atomic per-business numbering (`UPDATE...RETURNING` in
  the same transaction as the insert), snapshotted line items, cash
  auto-paid / credit pending, coupon discount, KPI cards with on-the-fly
  overdue detection.
- **6 Invoice PDF** — shared Jinja2 template; HTML preview works today;
  actual PDF blocked pending a one-time GTK3 install (QUESTIONS.md #4).
- **7 Quotations** — reuses the invoice calc/numbering engine;
  convert-to-invoice copies snapshotted lines; double-convert rejected.
- **8 Coupons** — admin CRUD, gated behind the `coupons` feature flag via a
  proper `FeatureFlagsContext` (also gates the IIM business itself in the
  switcher).
- **9 Dashboard** — period-scoped Total Sales/VAT, all-time Govt Fees "to
  date", employees get a reduced view, attendance strip now wired to real
  data (was a Prompt 9 placeholder, filled in once Prompt 11 landed).
- **10 Notifications** — calendar-aware month-offset reminder math (handles
  day-of-month clamping correctly), badge count polled via
  `NotificationsContext`, acknowledge/snooze/delete.
- **11 Attendance** — admin-only, upsert-on-remark verified, per-employee
  totals, feeds the Dashboard strip.
- **12 Reports** — all 8 from CLAUDE.md §8, exactly that set. CSV export via
  stdlib `csv`. **Print export uses `window.print()`, not WeasyPrint** — a
  deliberate scope read, flagged in QUESTIONS.md #7.
- **13 Audit Log & Design Studio** — `write_audit_log()` wired into the
  meaningful mutation points across ~10 routers (full gap list in
  QUESTIONS.md #9). Design Studio's `template_config` now drives real
  rendering (colors, fonts, logo, content toggles, table style, Bill-To
  fields, amount-in-words via a dependency-free number-to-words function) —
  layout presets are UI-only right now, only "Classic" actually renders
  differently (QUESTIONS.md #8). Live preview supports an unsaved draft
  config via a query param override, verified not to mutate the saved
  config.

---

## Prompt 14 — Deployment (scaffolded this session, not fully executed)

Full detail in **`backend/packaging/README.md`** — read that file before
touching any of this. Short version:

- **Decided SQLite** as the shipped default (simplest single-PC install per
  CLAUDE.md; swapping to Postgres later is just `DATABASE_URL`).
- **Refactored path resolution** (`app/core/config.py`): previously
  `UPLOAD_DIR`/`TEMPLATE_DIR` were computed independently via `Path(__file__)`
  in three different files — fragile, and would have broken under
  PyInstaller (paths resolve inside the temp extraction dir instead of a
  persistent location). Now centralized: `resource_dir()` for read-only
  bundled resources (templates, alembic), `settings.upload_dir` /
  `settings.database_url` for writable data, both frozen-aware (dev:
  `backend/`, packaged: `%PROGRAMDATA%\ProInvoicing\`). **This refactor was
  fully regression-tested** — every module still resolves the same paths in
  dev as before the change.
- **`packaging/run_server.py`, `pro_invoicing.spec`, `windows_service.py`**
  written and individually verified where verifiable (imports resolve,
  migrations+seed run correctly through the new entry point). **A full
  PyInstaller build was NOT attempted** — WeasyPrint's dynamic native-DLL
  loading is a known-hard case for PyInstaller and this needs to be tested
  deliberately, not rushed.
- **`ServerConfigGate`** (frontend) — the employee-install "enter the admin
  PC's address" first-run flow. Verified the admin/dev build's
  `VITE_API_URL` (now in a tracked `frontend/.env`) correctly bakes in and
  bypasses the gate; an employee build is the same `npm run build` with that
  var unset.
- **Backup & Restore** — fully built and verified end-to-end (set folder →
  backup → list → restore, including a path-traversal rejection test).
  Manual only; automated scheduling needs Windows Task Scheduler (documented
  in packaging/README.md) since there's no in-app cron and no long-lived
  auth token mechanism to call the endpoint unattended yet.
- **NOT done**: actually installing the Windows service (`sc create` /
  NSSM), opening the firewall (`New-NetFirewallRule`), Tauri desktop wrapper
  (needs a Rust toolchain not present here), code signing. All of these are
  system-level/heavy-prerequisite actions deliberately left as documented
  manual steps rather than run automatically.

---

## Known gotchas / things to remember

1. **WeasyPrint needs a manual GTK3 install on Windows** — QUESTIONS.md #4.
   `GET /api/invoices/{id}/preview` and `.../quotations/{id}/preview` work
   without it; `.../pdf` returns a clear 503 until it's installed.
2. Report "Print/PDF" uses `window.print()`, not WeasyPrint (QUESTIONS.md #7).
3. Design Studio's "Modern"/"Compact" layout presets don't actually render
   differently from "Classic" yet (QUESTIONS.md #8).
4. Audit logging covers the meaningful mutation points, not literally every
   endpoint — see QUESTIONS.md #9 for the exact gap list.
5. Port 5173 may be occupied by an unrelated project on this dev machine —
   Vite falls back to 5174 automatically, CORS is regex-permissive for any
   localhost port.
6. `backend/pro_invoicing.db` is the dev SQLite file, gitignored, currently
   reset to a clean seeded state (just Main/IIM + admin user). Rebuild any
   time: `alembic upgrade head` then `python -m app.seed` (idempotent).
7. Every money/rate field uses SQLAlchemy `Numeric`, never `float`, per
   CLAUDE.md §9 — stayed disciplined through all 13 app-building prompts.
8. Two unspecified judgment calls from Prompt 5, still in effect: coupon
   discount doesn't retroactively change per-line VAT, and govt fee is
   treated as per-unit (`govt_fee * qty`). Documented then, easy to change.
9. `packaging/requirements-build.txt` (pyinstaller, pywin32) is separate
   from the main `requirements.txt` on purpose — build-time only, not a
   runtime dependency of the app.

---

## Next up

Nothing is queued automatically. The 13 app-building prompts are done; Prompt
14 has real scaffolding but needs a human to actually run the manual steps
in `backend/packaging/README.md` (PyInstaller build, service install,
firewall rule) on a real machine and report back what broke. Until the user
weighs in (see open items in QUESTIONS.md), the most valuable next things
would be: (a) the user actually clicking through the app in a browser, (b)
resolving the WeasyPrint GTK3 blocker, (c) deciding whether to extend audit
log / Design Studio preset coverage, (d) attempting the PyInstaller build.

---

## How to run it

```bash
# Backend
cd backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
# (fresh DB: ./.venv/Scripts/python.exe -m alembic upgrade head
#  then ./.venv/Scripts/python.exe -m app.seed)

# Frontend (separate terminal)
cd frontend
npm run dev
```

Login: **MS_Software_Solutions / Invoicing@Hassas_2026**
