# Office Operations & TIN-FC Management Portal

Full-stack app for the SRS: staff/dual-shift attendance, agent master, PAN &
TAN processing (Modules 3/4) with the rejection→adjustment credit workflow,
inward/outward register, and client query ticketing.

## Stack

- Backend: Node.js + TypeScript + Express, PostgreSQL via Prisma ORM
- Frontend: React + Vite + TypeScript, Tailwind CSS, React Router
- JWT auth backed by server-side sessions, bcrypt password hashing, Zod
  request validation, nodemailer for SMTP
- Postgres runs locally via Docker Compose

## Status

**All 6 SRS modules are built end-to-end (backend + frontend):**

| Module | What's there |
|---|---|
| Dashboard | Aggregate counts across modules (`GET /api/dashboard`) — landing page after login |
| PAN applications | List (search / status filter / XLS+PDF export), keyboard-first create form with conditional visibility (Correction ⇒ PAN No., Agent ⇒ agent picker, Adjusted ⇒ lookup modal), Individual vs Non-Individual, detail view, admin edit/delete, TIN-FC acknowledgement Excel import with admin-configurable column mapping and composite (Aadhaar + Name/Mobile/DOB) matching |
| TAN applications | Same shape as PAN (Category → Name → DOI → Mobile → Source → Fee → Payment → Notes), search/export/detail/edit/delete |
| Agents | CRUD, activate/deactivate/reactivate, reset agent-portal password, ledger view (submitted / accepted / rejected / fee-credit balance, split PAN vs TAN) |
| Attendance | Dual-shift self-punch (blocked for future dates), daily team table with prev/today/next navigation and a live status-count summary, admin override (mandatory reason) and admin "mark for anyone" (also date-restricted), monthly report per staff (year/month pickers capped at the current month) with summary + total hours, XLS/PDF export (daily and monthly) |
| Inward/Outward register | List (search / type filters / export), create+edit with courier-driven conditional consignment number and "Other" detail fields, an optional mobile number, a free-text "Details of Courier" note (both entry types), detail view |
| Client queries | Public intake endpoint + staff intake form, list (search / status filter / export), detail page with assignment, status/response editing, and a timestamped audit trail |
| Agent self-service portal | Separate `AgentLayout` + `/portal/*` routes for AGENT-role logins: own ledger + form/credit summary, read-only "My Applications" (PAN + TAN they submitted, curated fields — no Aadhaar / internal notes), and "My Queries" — raise a query and see the staff response. Backed by `/api/agent-portal/*`, isolated from staff endpoints by role. |

Cross-cutting conventions applied everywhere: only **email and notes** are
ever optional; **mobile** is validated as 10 numeric digits; every "Other"
dropdown choice reveals a required "please specify" field; dates are entered
and shown as `DD/MM/YYYY` with auto-slash-on-type; every application row
records **entry date/time**, **form-received date**, and the **staff member
who created it**; edit/delete is **admin-only** across modules.

**On top of the 6 SRS modules, the following were added as standard
administrative/ops-tooling practice:**

| Feature | What's there |
|---|---|
| Category master data | Client-query "service category" and dispatch "item type" are no longer hardcoded enums — they're admin-managed lists (`MasterCategory`, `kind` = `SERVICE` or `DISPATCH_ITEM`). Any staff can add a new one inline from an entry form (`CategorySelect` component); rename/deactivate/delete is admin-only, under **Settings → Category Lists**. Deleting is blocked with `409` while any record still references the category — deactivate instead. |
| Users & module-based access | Admin CRUD for staff accounts under **/users**: full name, mobile (freely editable, including after creation), email, role, per-module access checklist (`pan`/`tan`/`agents`/`attendance`/`dispatch`/`queries`), one-click reset to the default password, deactivate/reactivate. Admins implicitly have every module; a Staff account only sees nav items and can only call APIs for the modules granted to them (`requireModule` middleware, enforced server-side — the frontend nav filter is a convenience, not the security boundary). Permission changes take effect without re-login: `authenticate` re-reads role/modules from the DB on every request, and the frontend refreshes its cached profile via `GET /api/auth/me` on load. |
| Admin-marked attendance | `POST /api/attendance/mark` lets an admin create/replace any staff member's attendance for any date (e.g. someone forgot to punch), with a mandatory note. Staff only ever see this read-only in the daily/monthly views — the edit affordance is admin-only. |
| Audit trail | Every mutating action (staff, agent-portal, and scheduled/system) is logged to a generic `AuditLog` — actor kind + id + denormalized name, action, entity type/id, optional JSON detail. Viewable and filterable (actor kind, entity type, action, free-text, date range) at **/audit**, admin-only, cursor-paginated. |
| Receipt uploads | Inward/Outward entries can attach a scanned receipt/proof (PDF or image, 8 MB cap) — `POST/GET/DELETE /api/dispatch/:id/receipt`. Files are stored outside the web root and served through an authenticated, path-traversal-guarded endpoint rather than as static files. |
| Day-end report & scheduler | Admin sets a daily send time (**Settings → Email & Day-End Report**) and picks which staff receive it; at that time (or via the "Send Report Now" button) the server builds a single multi-section PDF — PAN, TAN, attendance, client queries, dispatch, all for that day — and emails it to the configured recipients. Backed by an in-process `setInterval` scheduler (no external cron dependency), started from `index.ts`. |
| DB-backed SMTP config | SMTP host/port/user/password/from and the day-end send time live in a singleton `AppConfig` row, editable by admin (masked password field — leaving it as `********` keeps the stored value), with `.env` as a fallback only. A "Send Test" button confirms the config actually works before relying on it. |
| Default password + forced change | New staff/agent accounts and any admin-triggered password reset start on a fixed default (`Client@123`) with a `mustChangePassword` flag; the frontend redirects every route to `/change-password` until the user sets their own. Self-service "Forgot password?" on the login page emails a random one-time password instead (`/api/auth/forgot-password`), with a response that doesn't reveal whether the email was on file. |
| Document directory | Admin uploads form templates/formats (PDF/Office/image/zip, 15 MB cap) under **Documents**; any signed-in staff or agent can browse and download them, including from the agent portal — useful for handing agents the exact PAN/TAN form format the office wants. |

Settings itself is grouped into three tabs — **Category Lists**,
**Acknowledgement Import**, **Email & Day-End Report** — under `SettingsLayout`,
rather than one flat page, so each concern has room to grow.

## Local setup

1. Start Postgres:
   ```
   docker compose up -d
   ```
   > Note: the container is mapped to host port **5434**, not 5432 — this
   > machine already has a native PostgreSQL 17 Windows service bound to 5432,
   > which would otherwise silently intercept connections meant for Docker.

2. Backend — install deps and configure env:
   ```
   cd backend
   npm install
   cp .env.example .env
   ```
   Then set real values in `.env` for `JWT_SECRET` and
   `AADHAAR_ENCRYPTION_KEY` (a 64-hex-char / 32-byte key — generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
   and `SEED_ADMIN_EMAIL` (the address the Admin account logs in with).
   `SMTP_*` can stay blank — email sends just no-op and log instead of
   erroring when unset.

3. Apply the schema and seed the Admin account:
   ```
   npx prisma db push
   npm run seed
   ```
   > This repo uses `db push` rather than `migrate dev` because `migrate dev`
   > requires an interactive terminal to confirm schema-warning prompts. If
   > you have an interactive shell, `npx prisma migrate dev` works too and
   > additionally records a migration history under `prisma/migrations/`.

   The seed creates/updates the Admin **email**+password login using
   `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults to
   `admin@officemanagement.local` / `Admin@123`). **Change this password after
   first login.**

4. Start the API:
   ```
   npm run dev
   ```
   Health check: `GET http://localhost:4000/health`

5. Frontend — in a second terminal:
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` (Vite proxies `/api` to `localhost:4000`).

## Auth

Every principal — Admin, Staff, and Agent alike — signs in with **email +
password**. Mobile number is retained as profile information (and stays the
uniqueness key for staff) but is no longer a login path.

- `POST /api/auth/staff/login` — `{ email, password }` → JWT (works for both
  ADMIN and STAFF roles; `email` is mandatory on every staff account)
- `POST /api/auth/agent/login` — `{ email, password }` → JWT for the external
  agent portal. An agent only gets portal access when an admin checks
  "Enable agent portal login" while creating/editing them, which requires an
  email on file and starts the account on the default password (see below)
- `POST /api/auth/forgot-password` — `{ email }`, public, works for both
  staff and agents by the same email lookup
- `POST /api/auth/logout` — revokes the current session server-side (see
  below), so the token stops working immediately rather than staying valid
  until its natural expiry

Send the JWT as `Authorization: Bearer <token>` on all other endpoints except
`POST /api/queries` (public web-inquiry intake).

### Server-side sessions

Every login creates a row in the `sessions` table, and the JWT carries that
row's id as its `sessionId` claim. `authenticate` (in
[`backend/src/middleware/auth.ts`](backend/src/middleware/auth.ts)) checks the
session on every request — not just the JWT signature/expiry — so `/logout`
can mark a session revoked and have the token rejected immediately, which a
stateless JWT alone can't do. This costs one extra DB lookup per request,
which is an acceptable trade-off for an internal ops tool.

### SMTP

[`backend/src/utils/mailer.ts`](backend/src/utils/mailer.ts) wraps
`nodemailer` behind a `sendMail()` helper that never throws — if `SMTP_HOST`
is unset it just logs and no-ops, so a missing/broken mail server never blocks
login or any other request. Wired up for the "new admin sign-in" notification
and the self-service "forgot password" email. Fill in real `SMTP_*` values in
`.env` (or **Settings → Email & Day-End Report**) to actually send mail.

### Default passwords & forced password change

New staff/agent accounts, and any password reset triggered by an admin, start
on a fixed default password (`Client@123` — [`backend/src/utils/password.ts`](backend/src/utils/password.ts))
with `mustChangePassword` set on the record. `ProtectedRoute` on the frontend
enforces this everywhere: as long as that flag is set, every route redirects
to `/change-password` regardless of what the user tries to open, until they
successfully call `POST /api/auth/change-password` with their current and a
new password. Self-service "forgot password" (`POST /api/auth/forgot-password`,
linked from the login page) works differently — since the reset email is the
only proof of identity there, it mails a random one-time password instead of
the fixed default, and always returns the same generic response whether or
not the email matched an account, so it can't be used to enumerate registered
emails.

## Module → route map

| Module | Base route |
|---|---|
| Dashboard aggregates | `/api/dashboard` |
| 1. Staff & dual-shift attendance | `/api/staff`, `/api/attendance` (`/daily`, `/monthly`, `/daily/export`, `/monthly/export`, `/mark`, `/:id/override`) |
| 2. Agent master | `/api/agents` (`/:id/ledger`, `/:id/reset-password`) |
| 3. PAN applications | `/api/pan` (`/export`, `/adjustment-candidates`, `/import-ack`, `/:id/status`) |
| 4. TAN applications | `/api/tan` (`/export`, `/adjustment-candidates`, `/:id/status`) |
| 5. Inward/outward register | `/api/dispatch` (`/export`, `/:id/receipt`) |
| 6. Client queries | `/api/queries` (`/export`, `/:id/assign`, `/:id/edit`) |
| Agent self-service portal | `/api/agent-portal` (`/summary`, `/applications`, `/queries`, `/service-categories`) — AGENT role only |
| Category master data | `/api/master/:kind` (`kind` = `SERVICE` \| `DISPATCH_ITEM`) — list/create any staff, rename/deactivate/delete admin |
| Users & modules | `/api/staff` (create/update/deactivate/`:id/reset-password`, all admin except list/get) |
| Document directory | `/api/documents` (`/:id/download`) — list/download any authenticated principal (staff or agent); upload/delete admin |
| Audit trail | `/api/audit` (admin, filterable, cursor-paginated) |
| Settings — ack-import mapping | `/api/settings/pan-ack-mapping` (admin) |
| Settings — SMTP + day-end config | `/api/settings/email`, `/api/settings/email/test`, `/api/settings/day-end-recipients` (admin) |
| Day-end report | `/api/day-end-report/preview`, `/api/day-end-report/send` (admin) |
| Password self-service | `/api/auth/change-password` (any authenticated principal), `/api/auth/forgot-password` (public) |

## The rejection → adjustment workflow

This was the core piece of business logic in the spec and is implemented in
[`backend/src/utils/adjustment.ts`](backend/src/utils/adjustment.ts):

- `PATCH /api/pan/:id/status` (or `/api/tan/:id/status`) with
  `{ status: "REJECTED", rejectionReason }` flips `adjustmentAvailable = true`
  on that form.
- `GET /api/pan/adjustment-candidates?sourceType=AGENT&agentId=..` (or
  `sourceType=OFFICE&mobile=..`) implements the lookup-modal filtering from
  the SRS flowchart, and the frontend ([`PanFormPage.tsx`](frontend/src/pages/pan/PanFormPage.tsx))
  only triggers it once the relevant lookup key is actually filled in.
- `POST /api/pan` with `paymentMode: "ADJUSTED"` and `adjustedFromFormId`
  wraps the whole operation in `prisma.$transaction`, takes a
  `SELECT ... FOR UPDATE` row lock on the prior rejected form, re-checks
  `adjustment_available` under that lock, and only then creates the new form
  and flips the old one's flag to `false` — so two counter terminals racing
  to adjust the same rejected form cannot both succeed (verified manually:
  the second attempt gets `409 Conflict`).

## Possible next steps

- A public (unauthenticated) web form for external clients to submit a query —
  the `POST /api/queries` endpoint is already public; only the UI is missing.
- `prisma/migrations` history — the repo currently evolves the schema with
  `db push`; switch to `migrate dev` once on a machine with an interactive shell.
