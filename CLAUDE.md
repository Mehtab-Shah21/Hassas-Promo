# CLAUDE.md — Project Specification

> This file is the single source of truth for the project. Keep it in the repo
> root so it is always in context. Every prompt in `PROMPT-SEQUENCE.md` assumes
> the rules here. If a prompt ever conflicts with this file, this file wins —
> stop and ask.

---

## 1. What this is

An **offline-first invoicing desktop application** for a **PRO / government-liaison
services firm** in the GCC. The firm handles government paperwork on behalf of
customers (visa renewals, new visas, business documentation, etc.). Customers pay
the firm a **service fee**; the firm also often pays a **government fee** as part of
delivering that service.

It is a **service-based** system, NOT a retail/product system.

The app installs on an **admin PC** that acts as a local server. **Employee PCs**
connect to it over the **LAN**. No cloud, no subscription, works fully offline.

The same codebase must later be **resold to other clients** by toggling features on
and off — so it is built with a **feature-flag** layer from day one, and everything
client-specific lives in configurable data, never hardcoded.

---

## 2. Non-goals (do NOT build these)

The reference app (EVRST) has these; **we do not**:

- ❌ Stock / inventory / warehouse
- ❌ POS console / barcode / thermal-receipt POS flow
- ❌ Serialized inventory, warranty, loyalty/points
- ❌ Purchase invoices, vendors, COGS, weighted-average costing
- ❌ Profit report (needs COGS + overheads — explicitly excluded by the client)
- ❌ Multi-tenant SaaS (each client gets their own install; scope is per-install)

If a request seems to pull toward any of the above, stop and confirm.

---

## 3. Tech stack

- **Backend:** Python + FastAPI, SQLAlchemy (ORM), Alembic (migrations), Pydantic.
- **Database:** SQLAlchemy-abstracted. Dev = **SQLite**; production DB chosen at
  deploy time (SQLite or Postgres) via a single `DATABASE_URL` env var. **Never
  write raw DB-specific SQL** — keep everything portable through SQLAlchemy so the
  engine can be swapped without code changes.
- **Frontend:** React + Vite + Tailwind CSS.
- **Auth:** session or JWT, password + optional 4–6 digit PIN login.
- **PDF:** HTML template → **WeasyPrint** (the on-screen preview and the PDF render
  from the *same* template so they never drift).
- **Desktop packaging (deployment phase only):** Tauri shell for the frontend;
  FastAPI packaged with PyInstaller and run as a Windows service on the admin PC.

---

## 4. Core architecture rules (non-negotiable)

1. **Migration-safe forever.** All schema changes go through Alembic migrations.
   Updates must never require wiping client data. No destructive migrations without
   an explicit data-preserving path.

2. **Two-business scoping via `business_id`.** The client runs two of their OWN
   businesses in this app: the **Main** firm and a separate one called **IIM**.
   These live in a `businesses` table. Almost every domain table carries a
   `business_id` FK. IIM data is fully separate from Main data — customers,
   invoices, quotations, numbering, and branding never cross over.
   - ⚠️ **Naming discipline:** `business_id` = which of the owner's businesses
     (Main / IIM). A *customer* that happens to be a company is a different concept
     — see rule 3. Do not conflate them.
   - **Strict per-company user isolation.** Every non-superadmin user
     (admin or employee) is assigned to exactly ONE company via
     `users.business_id` and can never see, query, or act on the other
     company's data — not just hidden in the UI, enforced centrally in
     `core/deps.py`'s `require_active_business_id`: a non-superadmin's
     effective business is always their own `business_id`, and a request
     naming a different company via `X-Business-Id` is rejected (403), not
     silently redirected. Only **superadmin** is unscoped and spans both
     companies (keeps the business switcher). See §7.

3. **Company customers have employees (self-reference on `customers`).** A customer
   has `type` = `individual` | `company`. A company customer can have employees
   attached via `parent_customer_id` (self-FK). On an invoice, picking a company
   customer also lets you pick one of its employees.

4. **Server-side role enforcement.** Permissions are enforced in FastAPI
   dependencies, not just hidden in the UI. An employee hitting a restricted
   endpoint directly must be rejected. (See §7.)

5. **Feature flags.** A `feature_flags` table (per-install, global) gates optional
   modules. Reselling = flip flags, not fork code. Wrap optional modules
   (coupons, notifications, attendance, IIM, design studio, etc.) behind a flag so
   a future client can run a leaner build.

6. **Line items store snapshots.** Invoice/quotation lines copy description, price,
   and govt fee **at creation time**. Editing a service later must never change past
   documents.

7. **Atomic, per-business, config-driven numbering.** Invoice/quotation numbers =
   prefix + running counter stored on the business. Increment inside the same DB
   transaction that creates the document, so concurrent LAN users can't collide.

8. **Govt fee: stored + counted, hidden by default.** Every service carries its own
   `govt_fee`. It is always stored on the line and always counted on the dashboard
   ("government fees paid to date"). It is **NOT printed on the invoice** unless the
   admin turns on `show_govt_fee_on_invoice` in settings.

---

## 5. Modules

| Module | Summary |
|---|---|
| **Auth & Users** | Username/PIN login (email is an optional record field, not the login identifier), superadmin/admin/employee roles, session auto-lock. |
| **Users** | Superadmin/admin create, edit, and deactivate login accounts. An account may optionally link to an Employee record (see Attendance). |
| **Businesses & Settings** | Main + IIM profiles, branding, invoice defaults, regional (currency/date), feature flags, backup/restore. |
| **Customers** | Individual or company; company customers have employees. Per business. |
| **Services** | Custom services (the replacement for EVRST "items"). |
| **Invoices** | Core billing. Cash/credit, line items, VAT, coupon discount, lifecycle, PDF. |
| **Quotations** | Same engine as invoices; convert quotation → invoice in one click. |
| **Coupons** | Discount codes (percent or fixed) picked while invoicing. |
| **Notifications** | Manual per-customer reminders with custom types + date/relative triggers. In-app badges. |
| **Attendance** | Basic present/absent/leave per employee. Admin-only. Tracks against the shared Employee record (see §6) — not a login account. |
| **Dashboard** | KPI cards + recent invoices + attendance summary. Per business. |
| **Reports** | Finite service-based report set with CSV/PDF export. |
| **Audit Log** | Log meaningful actions with user, entity, timestamp, source. |
| **Design Studio** | Per-business config-panel + live preview that drives the PDF. |

---

## 6. Data model (canonical)

Use these tables/fields as the baseline. Add fields as needed; do not remove core
ones. All tables get `id`, `created_at`, `updated_at` unless noted.

**businesses** — the owner's businesses (Main, IIM)
`name, legal_name, tax_id, cr_no, phone_code, phone, email, website,
address_line1, address_line2, city, state, postal_code, country,
bank_account_name, bank_iban_or_no, bank_swift, bank_name,
logo_path, base_currency, currency_display (code|symbol), date_format,
invoice_prefix, next_invoice_no, quotation_prefix, next_quotation_no,
show_govt_fee_on_invoice (bool), default_vat_rate,
template_config (JSON — Design Studio), is_active`

**users**
`username (unique, login identifier), first_name, last_name, display_name,
email (optional, unique if set — record only, never used for login),
password_hash, pin_hash (nullable), role (superadmin|admin|employee),
employee_id (FK employees, nullable, unique — optional link to the shared
staff record below), business_id (FK businesses, nullable — the ONE
company this account is confined to; NULL only for superadmin, who spans
both — see §4 rule 2's isolation note and §7), avatar_color, phone_code,
phone, is_active`

**employees** (scoped by `business_id`) — the one staff record shared by
Attendance, Users (via `users.employee_id`), and the Expense module
`business_id (FK), name, role, phone_code, phone, base_salary (nullable —
used by Expenses), is_active` — no login of its own; a `users` row may
optionally point at one.

**customers** (scoped by `business_id`)
`business_id (FK), type (individual|company), name, email, phone_code, phone,
parent_customer_id (self-FK, null unless this row is an employee under a company),
id_kind (vat_tax|national_id), id_value,
address_line1, address_line2, city, state, postal_code, country, notes, is_active`

**service_categories** (scoped) — `business_id, name, description, is_active`

**services** (scoped)
`business_id, code, name, description, price, govt_fee, category_id (FK),
taxable (bool), is_active`

**coupons** (scoped) — `business_id, code, discount_type (percent|fixed), value,
is_active, valid_from, valid_to`

**invoices** (scoped)
`business_id, number, customer_id (FK), employee_customer_id (FK nullable),
transaction_type (cash|credit), invoice_date, due_date,
status (draft|sent|paid|partial|overdue|void),
subtotal, discount_total, coupon_id (FK nullable),
vat_total, govt_fee_total, grand_total, amount_paid,
notes, terms, show_bank_details (bool), created_by (FK user)`

**invoice_items**
`invoice_id (FK), service_id (FK nullable — null = ad-hoc line),
description (snapshot), qty, unit_price (snapshot), govt_fee (snapshot),
discount, vat_rate, line_total`

**quotations** (scoped) — mirror of invoices plus:
`validity_days, status (draft|sent|accepted|rejected|converted),
converted_invoice_id (FK nullable)`
**quotation_items** — mirror of invoice_items.

**payments** — `invoice_id (FK), amount, method, paid_on, reference`

**notification_types** (scoped, admin-managed) — `business_id, name, is_active`

**notifications** (scoped)
`business_id, customer_id (FK), type_id (FK), note, target_date,
acknowledged_at (nullable), created_by (FK user)`
**notification_reminders** — `notification_id (FK), offset_value, offset_unit
(day|week|month)` — "X before target_date". Multiple rows = multiple reminders.

**attendance** (scoped) — `business_id, employee_id (FK employees), date,
status (present|absent|leave), note` — unique (employee_id, date).

**audit_log** — `business_id (nullable), user_id (FK), action, entity_type,
entity_id, description, source_ip`

**feature_flags** — `business_id (FK, nullable), key, enabled, label` —
unique (business_id, key). Per-business for module toggles (Main/IIM
differ independently); `business_id` NULL is reserved for install-wide
flags (currently just whether the IIM business exists at all).

---

## 7. Permissions matrix

Superadmin is a strict superset of Admin everywhere in this table — anywhere
Admin has "full", Superadmin does too. The one place they genuinely differ is
the Users module itself.

**Company scope is a separate axis from this table.** Every row of "full"
access for Admin/Employee is implicitly "full access to THEIR OWN company
only" — an admin or employee is confined to the one company on
`users.business_id` and cannot reach the other company's data through any
module, including ones marked "full" here. Superadmin's "full" spans both
companies. IIM specifically is no longer a special-cased "admin-only"
business by name — it's just whichever company a given admin/employee's
`business_id` may or may not point at.

| Area | Superadmin | Admin | Employee |
|---|---|---|---|
| Customers | full | full | full |
| Invoices | full | full | full |
| Quotations | full | full | create/view |
| Notifications | full | full | full |
| Services / categories | full | full | **read-only** (to pick when invoicing) |
| Coupons | full | full | **read-only** (to apply when invoicing) |
| Dashboard financials | full | full | **denied** |
| Reports | full | full | **denied** |
| Audit log | full | full | **denied** |
| Settings / businesses / branding | full | full | **denied** |
| Design Studio | full | full | **denied** |
| Attendance | full | full | **denied** |
| Backup / restore | **full** | **denied** | **denied** (whole-DB operation spans both companies — superadmin only) |
| The OTHER company (whichever one isn't `users.business_id`) | full (spans both) | **denied** | **denied** |
| **Users — manage employee-role accounts** | full (either company) | full (**own company only**) | **denied** |
| **Users — manage admin/superadmin-role accounts** | full | **denied** | **denied** |
| **Users — grant admin/superadmin role** | full | **denied** | **denied** |

An account can never deactivate or change the role of its own row (self-lockout
guard), regardless of role. Enforce every "denied" and "read-only" at the API
layer — not just hidden in the UI.

---

## 8. Reports (finite set — build exactly these)

1. **Sales report** — total sales + invoice count over a period; sub-views:
   Summary / By Invoice / By Service.
2. **Government fees paid** — total govt fees over a period (the firm's key metric).
3. **VAT collected** — total VAT over a period.
4. **Outstanding / Aging** — unpaid & overdue invoices by customer.
5. **Customer statement** — one customer: billed, paid, outstanding.
6. **Service performance** — revenue and count per service.
7. **Quotations report** — created / accepted / converted / pending.
8. **Attendance summary** — per employee over a period.

Every report: period filter + **CSV** and **Print/PDF** export. All admin-only.

---

## 9. Conventions

- Backend: `app/` with `models/`, `schemas/`, `routers/`, `services/`, `core/`
  (config, db, security, deps). One router per module.
- Every list endpoint: pagination + search + filters.
- Money: store as integer minor units or `Numeric` — never float. Be consistent.
- Dates: store UTC; format for display per business `date_format`.
- Frontend: feature-based folders; a shared API client; a `<BusinessContext>` that
  holds the active business (Main/IIM) and scopes all requests.
- Every meaningful create/update/delete writes an `audit_log` row.

---

## 10. Assumptions to confirm with the client

These were reasonable defaults; flag them, don't silently rely on them:

1. ~~Employees work on the Main business only; IIM is admin-only~~ — **superseded**:
   every admin/employee is now assigned to exactly one company via
   `users.business_id` (either Main or IIM), confirmed and confined to it. Only
   superadmin is unscoped. See §4 rule 2 and §7.
2. Main and IIM keep **separate** customer lists (no sharing).
3. VAT is a **single simple percentage** (default rate on the business, overridable
   per line) — no multi-rate jurisdiction logic.
4. Notifications are **in-app only** (badge on the nav item + module), no OS toasts.
5. Attendance is **manual** (admin marks present/absent/leave) — no biometric/clock.
