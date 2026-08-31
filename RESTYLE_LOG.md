# RESTYLE_LOG.md — Bitrix24 dark-theme restyle, file-by-file

> Source of truth: `~/.claude/plugins/b24-h8rcnk-design/STYLE_GUIDE.md`
> (dark theme, `#000000`/`#333333` surfaces, `#0077ff` accent, Open Sans).
> Scope: **frontend React app UI only** — the invoice/quotation PDF template
> (`backend/app/templates/document.html.jinja2`) is explicitly NOT touched;
> it has its own separate, per-business branding system. See QUESTIONS.md
> #10-12 for the judgment calls made along the way.
>
> **This is a visual-only pass.** No component logic, props, state, hooks,
> handlers, routing, or data flow was touched in any file below — only
> Tailwind className strings and `index.css`. If in doubt, `git diff` any
> file listed here to confirm.
>
> **To undo:** every change is also its own git commit (see `git log`), so
> `git revert <hash>` per step works. This file exists as a second,
> human-readable record in case you'd rather hand-revert specific files
> without touching git — each entry below says exactly what changed.

---

## Status: Core pass DONE. See "Not yet covered" below for what's left.

## Plan

1. Tokens — `frontend/src/index.css` (Tailwind v4 `@theme`)
2. Shared primitives — `Field.tsx`, `Modal.tsx`, `SearchCombobox.tsx`
3. Shell — `AppShell.tsx`, `SettingsShell.tsx`, auth pages
4. Feature folders, one at a time: dashboard, customers, services, invoices,
   quotations, coupons, notifications, attendance, reports, audit,
   design-studio, settings pages

---

## Change entries

### 1. `frontend/src/index.css`
Added a Tailwind v4 `@theme` block defining every token from the style
guide: core color roles (bg/surface/ink/muted/line/accent/danger/warning/
info), extended neutral scale (gray-10…90), accent/status colors, the
`--font-sans` family (Open Sans + fallbacks), the border-radius scale
(sm/md/lg/xl/full), and 4 shadow levels (flat/raised/floating/overlay).
Set `body` to use `--color-bg`/`--color-ink`/`--font-sans` and
`color-scheme: dark` (affects native form-control rendering only).

**Effect on the rest of the app without touching another file**: every
existing `rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-full` usage (170
occurrences across 48 files) automatically picked up the guide's radius
scale, since Tailwind generates those utilities from the token values.
Verified via `npm run build` + inspecting the compiled CSS.

**Not yet visible**: color utilities like `bg-surface`/`text-ink` don't
appear in the compiled CSS yet — Tailwind v4 only emits utilities for
classNames it finds actually used in source, so they'll show up as each
component below is switched over to reference them.

To undo just this step: revert `frontend/src/index.css` to its prior
version (`@import "tailwindcss";` + the small html/body/print rules, no
`@theme` block).

### 2. Shared primitives
- `frontend/src/components/form/Field.tsx` — label text, input/textarea
  border+background+text+focus ring, SaveButton background — all switched
  from the old slate/indigo classNames to the new tokens (`border-line`,
  `bg-surface`, `text-ink`, `text-muted`, `focus:border-accent`,
  `bg-accent`). No prop/behavior change.
- `frontend/src/components/Modal.tsx` — backdrop, panel background/shadow
  (now `shadow-overlay`, the guide's dedicated modal elevation level),
  header border, title/close-button colors.
- `frontend/src/components/SearchCombobox.tsx` — input + dropdown panel
  (now `shadow-floating`, the guide's dropdown elevation level), option
  hover state (`hover:bg-white/5` — a translucent overlay since dark
  surfaces can't reuse a `hover:bg-slate-50`-style light tint), "extra
  option" link color → `text-accent`.
- `frontend/src/components/PlaceholderPage.tsx` — still live (used by
  `AdminOnlyRoute.tsx`'s fallback screen), same token swap.

These four files back essentially every form, modal, and combobox in the
app, so this step's effect is much larger than 4 files even though only 4
were edited.

To undo: revert these 4 files individually, or as a group (they were one
commit — see git log for the hash).

### 3. Shell + auth pages
- `frontend/src/layouts/AppShell.tsx` — sidebar and top bar now both
  `bg-bg` (page black) with a `border-line` divider between them (was two
  different grays before); active nav item `bg-accent`; business-switcher
  select and role pill restyled to tokens.
- `frontend/src/features/settings/SettingsShell.tsx` — active settings-nav
  item uses a translucent `bg-accent/10 text-accent` instead of the old
  indigo-50/indigo-700 pair; content panel → `bg-surface`.
- `frontend/src/features/auth/LoginPage.tsx`, `LockScreen.tsx` — card →
  `bg-surface` with `shadow-floating`/`shadow-overlay`; established the
  pattern used everywhere else from here on: **input fields use `bg-bg`
  (darker than their containing `bg-surface` card)** so they're visually
  distinguishable from the panel they sit in, not just from their border.
  Retroactively applied this same input background to `Field.tsx` and
  `SearchCombobox.tsx` from step 2 for consistency (both were `bg-surface`,
  same as their containers — fixed to `bg-bg`).
- `frontend/src/components/ProtectedRoute.tsx` — loading-state text color
  + background only.

To undo: revert the 6 files in this step (see git log). Note step 2's
Field.tsx/SearchCombobox.tsx were touched again here for the input-bg fix —
if you revert step 2 first you'll want to revert this commit too, or the
input backgrounds will mismatch their containers.

### 4. Every feature page — mechanical token mapping (37 files)

With the primitives/shell established, the remaining ~40 feature files all
reused the same handful of old-palette Tailwind classes (border-slate-300,
text-slate-500/600/700/800/900, bg-white, bg-indigo-600, text-emerald-600,
etc.) — the exact same patterns everywhere, just copy-pasted across pages.
Rather than hand-edit 40 files one at a time with identical changes, applied
one comprehensive `sed` mapping across all of them at once, then verified
with `npm run build` + a full grep sweep for anything left unmapped. Full
mapping table:

| Old (light theme) | New (token) | Role |
|---|---|---|
| `bg-white` | `bg-surface` | card/panel background |
| `bg-slate-50` | `bg-white/5` | subtle row/section tint (table headers) |
| `bg-slate-100` | `bg-white/10` | pill/badge background |
| `bg-slate-200`/`-300` | `bg-white/15`/`/20` | rare, slightly stronger tint |
| `border-slate-100/200/300/800` | `border-line` | all borders/dividers |
| `ring-slate-200` | `ring-line` | |
| `divide-slate-100/200` | `divide-line` | |
| `text-slate-900`/`800` | `text-ink` | primary/emphasis text |
| `text-slate-700`/`600`/`500`/`400` | `text-muted` | labels, captions, secondary text |
| `focus:border-indigo-500` | `focus:border-accent` | |
| `bg-indigo-600` | `bg-accent` | primary buttons |
| `hover:bg-indigo-700` | `hover:opacity-90 transition-opacity` | button hover (no darker-accent token exists, so uses opacity instead) |
| `text-indigo-600`/`700` | `text-accent` | links |
| `bg-indigo-100` | `bg-accent/10` | accent-tinted badges |
| `text-red-500/600/700` | `text-danger` | errors/destructive |
| `bg-red-100`/`500` | `bg-danger/10`/`bg-danger` | |
| `text-emerald-600/700` | `text-accent-green` | success/positive (guide's status palette) |
| `bg-emerald-100/600` | `bg-accent-green/10`/`bg-accent-green` | |
| `text-amber-600/700` | `text-orange-50` | warning text (guide's `--warning` is a pale beige, unreadable as text on dark bg — used the vibrant `orange-50` status token instead for anything that needs to actually read as a warning color) |
| `bg-amber-100/500` | `bg-orange-50/10`/`bg-orange-50` | |
| `text-blue-600/700` | `text-info` | informational |
| `bg-blue-100` | `bg-info/10` | |

**Bug caught and fixed mid-pass**: the `bg-white` → `bg-surface` rule ran
before the `hover:bg-white` → `hover:bg-white/5` rule in the sed script.
Word-boundary matching doesn't stop at `/`, so it also corrupted the
opacity-suffixed patterns from step 2/3 (`bg-white/5`, `bg-white/10`) into
`bg-surface/5`, `bg-surface/10` in the 3 files that already had them
(`SearchCombobox.tsx`, `SettingsShell.tsx`, `AppShell.tsx`). Caught via a
follow-up grep for `bg-surface/[0-9]+` (a pattern that should never exist —
`bg-surface` is meant to be solid), fixed with a second targeted sed pass,
verified clean.

**Context bug also caught**: `ServerConfigGate.tsx` (the employee first-run
"connect to server" screen) wasn't part of the earlier manual shell/auth
pass, so the mechanical mapping turned its full-page wrapper's
`bg-slate-100` into `bg-white/10` — correct token-for-token, but wrong in
context: that's a page-level background, not a subtle overlay, and `10%
white on black` reads as almost-black, not the intended visible page
backdrop. Fixed by hand to match `LoginPage.tsx`'s established pattern
(`bg-bg` page, `shadow-floating` card, `bg-bg` input) — this file is
functionally identical to LoginPage (a full-screen pre-auth gate) and now
looks consistent with it.

**`design-studio/DesignStudioPage.tsx` handled separately, by hand** (not
part of the sed sweep) because it contains `COLOR_PRESETS`, an array of
hex values that are *business data* — the color choices offered to admins
for branding their own invoice PDFs — not app styling. Restyled all the
surrounding chrome (panel backgrounds, labels, selects, buttons) to the new
tokens; **the 6 preset hex values themselves are byte-for-byte unchanged**
(verified via grep). Also fixed the color-swatch selection indicator, which
used `border-slate-800` (near-black) to mark the selected swatch — invisible
against the new black page background — now `border-ink` (bright) for
selected vs `border-line` for unselected.

Verified across the whole sweep: `npm run build` clean, and a repo-wide
grep for every old Tailwind color family (slate/indigo/red/emerald/amber/
blue/gray/zinc/neutral/stone/sky/cyan/teal/green/purple/pink/yellow) with
a numeric suffix returns zero matches outside intentional new tokens
(`orange-50`, `accent-green`, etc., which matched the grep pattern
harmlessly since they share the `-NN` suffix shape).

To undo: this was 37 files in one mechanical pass + `ServerConfigGate.tsx`
+ `DesignStudioPage.tsx` as 2 more targeted edits — see git log for the
commit(s). Since it was a uniform token substitution, reverting the commit
cleanly restores every old className.

---

## Not yet covered (honest gaps, not oversights)

- **Motion.** The guide specifies spring physics, staggered reveals, and
  named Lottie-derived keyframes. Not implemented — see QUESTIONS.md #12.
  Buttons/links that changed color on hover now also transition smoothly
  where I touched them (`transition-opacity` on primary buttons), but
  nothing beyond that.
- **Typography scale.** Colors, font family, radius, and spacing all follow
  the guide; the actual point sizes (guide: H1 19px/H2 16px/H3 14px/body
  13.33px/caption 13px) were left as Tailwind's existing text-xs/sm/base/lg
  scale rather than overridden, since redefining those globally would touch
  the sizing of essentially every element in the app at once — a much
  bigger, harder-to-review change than a color/token swap, and risks
  breaking table/form density that was tuned for the current sizes. The
  guide's own sizes are close to Tailwind's defaults already (its "inspired,
  not literal" caveat applies here too). Flagging as a deliberate scope
  boundary, not a miss.
- **Native form controls** (checkbox/radio appearance) — only got
  `color-scheme: dark` globally (affects native rendering in modern
  browsers) and border-color token swaps; no custom checkbox/radio SVG
  styling was added.
- **Extended status colors** (`accent-purple`, `accent-turquoise`,
  `accent-pink`, `accent-aqua`, `accent-light-blue`, `blue-30`) are defined
  as tokens in `index.css` but not applied anywhere yet — nothing in the
  current UI needed a 5th/6th status color beyond danger/warning/info/
  success, which are covered. Available if you want them for something
  later (e.g. category tags).
- **Not visually verified in a browser** — no browser/screenshot tool is
  available in this environment. Every step was verified via `npm run
  build` (TypeScript + Vite compile clean) and exhaustive `grep` sweeps for
  leftover old-palette classes, not by looking at rendered pixels. Click
  through it yourself before trusting the look is right.

