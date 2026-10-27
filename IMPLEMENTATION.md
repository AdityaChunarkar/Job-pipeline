# Implementation tracker

## Done (verified)
- Monorepo: `server/` (Express + TS + Prisma 6 + Zod) and `client/` (React + Vite + Tailwind v4).
- Prisma schema + `init` migration: User, Job, Application (unique jobId+candidateId), ApplicationStatusHistory, EmployerNote, Notification.
- Auth (register/login/logout/me), httpOnly cookie JWT, role loaded from DB each request.
- Employer jobs: create, edit (PUT), close/reopen, paginated applicants with status filter.
- Candidate: public search (q/location/type), pagination, locations list, job detail, apply (multipart PDF), my applications with history.
- Pipeline transitions with history + notification in one transaction; employer private notes.
- Secure resume handling (extension + MIME + signature, size limit, random names, private dir, owner-only download).
- Notifications: list, unread count, mark one/all read; employer notified on new application.
- Frontend: landing, auth, jobs, job detail + apply, candidate dashboard, employer dashboard, job form, applicants panel, notifications.
- Seed (idempotent), 23 backend tests passing, lint/typecheck/build pass for both workspaces.

## Outstanding
- Visual/responsive verification of the UI in a real browser (not done).
- Frontend tests / e2e; deployment (not done).

## Key commands
`npm install`, `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Notes / known issues
- Dev DB runs in Docker on port 55432 (5433 was occupied on the author's machine). Test DB `jobboard_test` must be created manually (README).
- Tailwind v4: custom classes are `@utility` blocks in `client/src/index.css` (`@apply` of `@layer components` classes fails).
- Git Bash heredocs with certain content broke during authoring; irrelevant to the project.
- See README "Known limitations" for product-level gaps.
