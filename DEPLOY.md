# Web Demo Deployment (Render + Vercel)

This is an **additional** deployment path for showing this app to a client over
the web. It does not touch or replace the offline/LAN install described in
`backend/packaging/README.md` — that packaging, and everything it depends on,
is unchanged. This path exists purely so a browser anywhere can reach a live
demo without installing anything.

Follow the steps **in this order** — the frontend needs the backend's URL
before it's built, and the backend needs the frontend's URL for CORS after.

---

## Step 1 — Deploy the backend on Render

1. Push this repo to the separate GitHub repo you're using for the demo (you're
   handling all `git push`; nothing here has been pushed for you).
2. In the Render dashboard: **New → Web Service**, connect that GitHub repo.
3. If Render offers to use `render.yaml` (New → Blueprint), it will pick up
   the settings below automatically. Otherwise, set these manually:

   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Health Check Path | `/api/health` |
   | Plan | Free is fine for a demo |

4. Environment variables (Render dashboard → Environment):

   | Key | Value | Notes |
   |---|---|---|
   | `SECRET_KEY` | a random string | Render can generate one for you (Blueprint does this automatically). Don't leave the code default. |
   | `RUN_MIGRATIONS_ON_STARTUP` | `true` | Runs Alembic + the seed on every boot — see "Ephemeral disk" below. |
   | `FRONTEND_ORIGIN` | *(leave unset for now)* | You'll set this in Step 3, after the frontend has a URL. |
   | `DATABASE_URL` | *(leave unset for now)* | See "Database" below — unset is fine for a demo. |

5. Deploy. Once it's live, copy the backend's URL — something like
   `https://pro-invoicing-backend.onrender.com`. You'll need it in Step 2.
6. Sanity check: open `https://<your-backend>.onrender.com/api/health` in a
   browser. You should see `{"status":"ok","app":"PRO Invoicing"}`. If this
   doesn't respond, don't move on to Step 2 — check Render's logs first.

### Database

By default (no `DATABASE_URL` set) the backend uses a local SQLite file.
**Render's free-tier disk is ephemeral** — every redeploy or restart gets a
fresh filesystem, so that SQLite file resets. `RUN_MIGRATIONS_ON_STARTUP=true`
means this is invisible: on every boot the backend runs Alembic to head and
the seed script (idempotent — admin login + Main/IIM businesses), so the demo
always comes back up with working login data. Any customers/invoices you
create during a demo session will disappear on the next restart — fine for a
demo, not fine for anything that needs to persist.

**To make data persist:** add a Render Postgres database (Render dashboard →
New → PostgreSQL, free tier is fine), copy its "Internal Database URL", and
set that as this service's `DATABASE_URL`. That's the *only* change needed —
`app/core/config.py` already normalizes the `postgres://` scheme Render hands
out into the `postgresql://` scheme SQLAlchemy expects, and `psycopg2-binary`
is already in `requirements.txt`. No code touches this.

---

## Step 2 — Deploy the frontend on Vercel

1. In Vercel: **New Project**, import the same repo.
2. Root Directory: `frontend`. Vercel auto-detects Vite (build command
   `npm run build`, output directory `dist`) — leave those as detected.
3. Environment variable, **set before the first build**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | the Render backend URL from Step 1, e.g. `https://pro-invoicing-backend.onrender.com` (no trailing slash) |

   This is read at *build* time (`frontend/src/api/client.ts`), so if you add
   or change it later you must trigger a new deploy for it to take effect.
4. Deploy. Vercel gives you a URL like `https://your-app.vercel.app`.
5. `vercel.json` (already in `frontend/`) rewrites every route to
   `/index.html` — without it, refreshing or deep-linking a route like
   `/invoices` 404s, since Vercel would otherwise look for a literal
   `invoices` file. Vercel picks this up automatically; no dashboard setting
   needed for it.

### About the "connect to your server" screen

The normal LAN/offline build asks an employee PC for the admin PC's address
on first run (`ServerConfigGate`). That screen is skipped automatically
whenever `VITE_API_URL` was set at build time — that's already exactly the
existing behavior of `hasConfiguredServerUrl()` in `api/client.ts`, not
something added for this deployment. As long as Step 2.3 is done, whoever
opens the Vercel link lands straight in the login screen, already pointed at
your Render backend.

---

## Step 3 — Go back to Render and set FRONTEND_ORIGIN

1. Render dashboard → your backend service → Environment.
2. Set `FRONTEND_ORIGIN` to the exact Vercel URL from Step 2 (e.g.
   `https://your-app.vercel.app`, no trailing slash).
3. Save — Render redeploys the service automatically.
4. Until this is done, the frontend can load but every API call fails
   silently in the browser console with a CORS error (the backend simply
   won't send back the right `Access-Control-Allow-Origin` header for an
   origin it doesn't recognize). This is the most common thing to forget —
   if login doesn't work after deploying both sides, check this first.

---

## Step 4 — Warm up the free tier before sending the link

Render's free web services spin down after a period of inactivity. The
**first** request after that wakes it back up and takes roughly 30–60
seconds — long enough that a client clicking the link cold will think it's
broken. Before sending the demo link:

1. Open `https://<your-backend>.onrender.com/api/health` yourself and wait
   for it to respond.
2. Then open the Vercel frontend URL and log in once yourself to confirm it's
   fully warm end-to-end.
3. *Then* send the client the Vercel link. If there's a gap of more than ~15
   minutes between your warm-up and them clicking it, it may go back to
   sleep — repeat the health-check ping shortly before they're expected.

---

## Verification checklist (do this after Steps 1–3)

Login: `admin@example.com` / `admin123` (from the seed — same as local dev).

- [ ] Log in as admin.
- [ ] Switch between Main and IIM in the business switcher — data is
      independent per business (confirmed during this setup: customers,
      invoices, and numbering are correctly scoped).
- [ ] Create a customer.
- [ ] Create an invoice for that customer.
- [ ] Open the invoice's Print Preview and generate/download the PDF.
      xhtml2pdf is pure Python (no GTK3/native library dependency, unlike
      WeasyPrint) so it works on Render's Linux containers exactly as it
      does locally — this was already true before this deployment work,
      not something added for it.
      PDF/thermal downloads go through `fetchInvoicePdfBlob` (and the
      equivalent quotation/thermal functions) — a `GET` with an
      `Authorization` header and an `X-Business-Id` header, fetched as a
      blob and handed to the browser locally. That path works cross-origin
      exactly like any other API call once Step 3's CORS origin is set;
      nothing PDF-specific needed changing for it to work deployed.
- [ ] Log out, log back in — confirms the deployed JWT flow works end to end.

If anything in this checklist fails, it's almost always one of: Step 3 not
done (CORS), `VITE_API_URL` not set before the Vercel build (frontend still
pointed at `localhost:8000`), or the Render service still waking up (Step 4).

---

## What changed in the codebase for this

- `backend/app/core/config.py` — added `frontend_origin` and
  `run_migrations_on_startup` settings (both default off/unset — zero effect
  on local dev or the packaged offline build), and a `postgres://` →
  `postgresql://` URL normalizer.
- `backend/app/main.py` — CORS now also allows `frontend_origin` if set
  (alongside the existing localhost dev origins, not instead of them); added
  a startup hook that runs Alembic + the seed, but only when
  `RUN_MIGRATIONS_ON_STARTUP=true` — off by default everywhere else.
- `backend/requirements.txt` — added `psycopg2-binary` so switching
  `DATABASE_URL` to Postgres needs no further installs.
- `render.yaml` (repo root) — Render Blueprint config for Step 1.
- `frontend/vercel.json` — SPA rewrite for Step 2.

Nothing about invoice/quotation logic, PDF templates, feature flags, or the
existing PyInstaller/Windows-service packaging was touched.
