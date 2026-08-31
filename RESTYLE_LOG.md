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

## Status: IN PROGRESS

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

