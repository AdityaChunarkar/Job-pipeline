# Pipeline: Job Board with Hiring Pipeline

A full-stack job board where **employers** post jobs and move applicants through a hiring pipeline, and **candidates** search jobs, apply with a PDF resume, and track their status.

## Features

**Candidates**: register and log in, browse open jobs, search by keyword, filter by location and type, view job details, apply once per job with a PDF resume and optional cover letter, see applications with a status timeline, and get in-app notifications on status changes.

**Employers**: create, edit, close and reopen jobs, view paginated applicants per job, download resumes (own jobs only), move applicants through **Applied → Shortlisted → Interview → Hired** (or **Rejected** from any active stage), and keep private notes.

## Architecture

```
client/  React + TypeScript + Vite + Tailwind CSS v4 (SPA, react-router)
server/  Node.js + Express + TypeScript, Zod validation, Prisma ORM
         src/routes/    auth, jobs (public + employer), applications, notifications
         src/storage.ts PDF validation and private file storage
         src/pipeline.ts status transition rules
         prisma/        schema, migrations, seed
         tests/         Vitest + Supertest (real PostgreSQL test database)
```

In development Vite proxies `/api` to the Express server, so the browser sees one origin and the httpOnly session cookie works without cross-site cookie settings.

### Database model

`User` (role EMPLOYER | CANDIDATE) → `Job` → `Application` (unique on `jobId + candidateId`) → `ApplicationStatusHistory`, `EmployerNote`. `Notification` belongs to a user and optionally references an application. All relations use foreign keys with cascading deletes; indexes cover employer's jobs, open-job listing, location/type filters, applicants by job/status, and unread notifications.

## Security decisions

- **Auth**: bcrypt (cost 12) password hashes; JWT stored in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The user and role are **reloaded from the database on every request**; nothing about role or identity is trusted from the client. Registration only accepts `EMPLOYER` or `CANDIDATE`. Login/register are rate limited, and login does equal work for unknown emails.
- **Authorization** is enforced in middleware (`requireAuth`, `requireRole`) and in ownership checks in each route (a job's employer, an application's candidate). Other users' resources return 403.
- **Resume uploads**: server-side size limit (`MAX_UPLOAD_BYTES`); extension, MIME type **and** `%PDF-` file signature must all match; held in memory until validated; stored under a random UUID filename (client name is never used on disk, and stored names are re-validated against a strict pattern on read to prevent path traversal); stored in `UPLOAD_DIR` outside both the frontend and any static directory; file mode 0600.
- **Resume download** is only `GET /api/applications/:id/resume`, requiring the employer who owns the application's job. There are no public URLs. Responses use `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`. Resume contents are never logged.
- **Integrity**: duplicate applications are blocked by a backend check and the DB unique constraint (race-safe, with file cleanup on failure). Application creation and status changes run in transactions, together with history and notification rows. Status changes use a conditional update to avoid concurrent double transitions.
- **Transport / headers**: Helmet defaults, CORS limited to `CLIENT_ORIGIN` with credentials, JSON body limit, centralized error handler that never leaks internals.

## Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL 14+ (a `docker-compose.yml` is provided; Docker is optional if you have your own Postgres)

## Local setup

```bash
npm install                         # installs both workspaces
docker compose up -d                # PostgreSQL on localhost:55432 (skip if using your own)
cp .env.example server/.env         # then edit values (see below)
docker exec -it $(docker compose ps -q db) psql -U jobboard -c "create database jobboard_test"
npm run db:migrate                  # apply migrations to the dev database
npm run db:seed                     # demo data (safe to re-run)
npm run dev                         # API on :4000, web on http://localhost:5173
```

### Environment variables (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for the app |
| `TEST_DATABASE_URL` | **Separate** database used by tests (tests refuse to run if it equals `DATABASE_URL`) |
| `JWT_SECRET` | Session signing secret, at least 32 characters. Generate a random one |
| `JWT_EXPIRES_IN` | Token lifetime, default `7d` |
| `PORT` | API port, default `4000` |
| `CLIENT_ORIGIN` | Allowed browser origin for CORS, default `http://localhost:5173` |
| `NODE_ENV` | `development`, `test` or `production` |
| `UPLOAD_DIR` | Private resume directory, default `./storage/resumes` (relative to `server/`) |
| `MAX_UPLOAD_BYTES` | Maximum resume size, default `5242880` (5 MB) |

`.env`, uploaded resumes (`server/storage/`) and build output are git-ignored.

## Commands

| Task | Command |
| --- | --- |
| Migrate (dev) | `npm run db:migrate` |
| Apply migrations (prod/CI) | `npm run db:deploy -w server` |
| Seed | `npm run db:seed` |
| Tests | `npm test` (applies migrations to the test DB, then runs Vitest) |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Production build | `npm run build` |

## Demo logins (development only)

Created by `npm run db:seed`. Password for all: `DemoPass123!`. These are demo credentials for local development only.

| Role | Email |
| --- | --- |
| Employer | `employer@demo.test` |
| Candidate | `candidate@demo.test` |
| Extra candidates | `priya@demo.test`, `rahul@demo.test` |

The seed creates 6 jobs (varied locations/types, one closed) and 7 applications across all pipeline stages with history, notifications and notes. Re-running does not create duplicates.

## Automated tests

23 backend tests (Vitest + Supertest against a real PostgreSQL database) cover: successful apply, duplicate rejection (API and DB constraint), closed-job rejection, search/filter/pagination, cross-employer access denial (jobs, applicants, notes, status), only-owner resume download (other employer, applicant, anonymous all denied), missing file and path traversal handling, invalid/oversized/missing uploads, safe server filenames, status history + notifications, invalid transitions, private notes, and auth basics.

## Status

**Verified:** type-check, lint, production builds, all 23 tests, seed idempotency, and a manual HTTP walkthrough through the Vite proxy (login, listing, apply with invalid and valid PDF, duplicate refusal, resume download as owner/candidate/anonymous, invalid and valid status transitions, notification delivery, security headers).

**Not verified:** the React UI was built and type-checked but I did not click through it in a browser, so layout/responsiveness has not been visually confirmed. There are no frontend tests. **Not deployed**; there is no live demo URL.

## Known limitations / future improvements

- Jobs are published immediately (no draft state).
- Resumes live on local disk; production should use private object storage (S3 with signed, short-lived URLs) and virus scanning.
- JWT sessions cannot be revoked server-side before expiry; rate limiting is in-memory (single instance).
- Notifications are in-app and polled every 30s (no email/websockets).
- CSRF protection relies on `SameSite=Lax` cookies plus restricted CORS; add CSRF tokens if cross-site embedding is ever needed.
- Employers cannot delete their own jobs; candidates cannot withdraw applications.
- No password reset or email verification.
- Add frontend tests and an end-to-end suite (Playwright).

## Deployment notes (untested)

Build with `npm run build`, set `NODE_ENV=production`, real `DATABASE_URL`, a strong `JWT_SECRET`, `CLIENT_ORIGIN`, and a persistent private `UPLOAD_DIR`; run `npm run db:deploy -w server` then `npm start -w server` from `server/`. In production Express serves `client/dist` when it exists, so a single process can host both. This has not been deployed or verified.
