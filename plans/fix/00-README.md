# Plans/fix 00 — READ ME FIRST (conventions, environment, verification harness)

> **Consumer: Cursor Composer 2.5.** Load this file into context at the start of EVERY session,
> together with exactly ONE numbered plan (01–07). Never execute two numbered plans in one session.
>
> Execution order: 01 and 02 (either order, both must pass) → 03 → 04, and 05 → 06 (needs 01+02;
> 05/06 can interleave with 03/04) → 07 last.

## 1. What this plan series is

The Edrion student portal (`apps/student-web` + `apps/api` student modules) is ~90% built and
data-driven, but several things are broken or unfinished. Plans 01–07 repair and finish it. This is
a **repair series over an existing codebase** — the original build plans live in `plans/00-04` and
`plans/00-overview.md` remains the binding source for names, contracts, and product rules. When a
numbered plan cites "overview §N", that means `plans/00-overview.md` section N.

## 2. Repo facts

- pnpm-workspaces + Turborepo monorepo. Relevant packages:
  - `apps/api` — NestJS backend, port **3001**, global prefix **`/v1`**. Swagger at `/docs`.
  - `apps/student-web` — Next.js 14 App Router, port **3005**.
  - `packages/database` — Drizzle ORM + hand-authored SQL migrations `0000`–`0059`.
  - `packages/config/src/index.ts` — zod env schema (single source of env var names/defaults).
  - `packages/schemas` — zod DTOs shared between api and web.
- Env: single root `.env` (loaded by `apps/api/src/main.ts` via dotenv). No per-app env files for the API.
- Student auth: HTTP-only cookie session (`edrion_student_session`), issued by
  `POST /v1/student/auth/login`. The web client (`apps/student-web/src/lib/student-client.tsx`)
  sends `credentials: 'include'` and, in dev, an `x-student-email` impersonation header
  (default `student@greenwood.edu`, from `NEXT_PUBLIC_DEV_STUDENT_USER` in
  `apps/student-web/src/lib/env.ts`). The API honors that header only when `STUDENT_AUTH_DEV_HEADER`
  is enabled and `NODE_ENV != production`.

## 3. How to run things (Windows; shell is PowerShell 5.1 or Git Bash)

Node is v20 but the repo pins `pnpm@11` (which wants Node 22). **Prefix every pnpm command with
corepack:**

```
corepack pnpm@9.15.9 install
corepack pnpm@9.15.9 --filter @edrion/api dev            # API on http://localhost:3001 (ts-node-dev, hot respawn)
corepack pnpm@9.15.9 --filter @edrion/student-web dev    # web on http://localhost:3005 (predev regenerates tokens.css)
corepack pnpm@9.15.9 --filter @edrion/api typecheck
corepack pnpm@9.15.9 --filter @edrion/student-web typecheck
corepack pnpm@9.15.9 --filter @edrion/api test           # vitest
corepack pnpm@9.15.9 --filter @edrion/student-web build
```

PowerShell 5.1 notes: `&&` does not chain — use `;` or separate commands. Use `curl.exe`
(not bare `curl`, which aliases Invoke-WebRequest).

## 4. Verification harness

**Mounted-route smoke test (no auth needed).** A route that exists but requires auth returns
401/403; an unmounted route returns 404:

```
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/v1/student/analytics
# 401 or 403 = controller mounted; 404 = not mounted
```

**Authenticated curl.** Log in and reuse the cookie:

```
curl.exe -s -c cookies.txt -H "Content-Type: application/json" ^
  -d "{\"email\":\"<seeded student email>\",\"password\":\"<seeded password>\",\"institutionCode\":\"<code>\"}" ^
  http://localhost:3001/v1/student/auth/login
curl.exe -s -b cookies.txt http://localhost:3001/v1/student/me
```

Find seeded student credentials in `packages/database/src/seed*.ts` (run `corepack pnpm@9.15.9 db:seed`
from the repo root if the DB is empty). The dev impersonation email `student@greenwood.edu` is the
frontend default — a matching seeded student should exist.

**Browser check.** For any page-level acceptance criterion, load the page at
`http://localhost:3005/<route>` and confirm real data renders (not an error state or endless spinner).

## 5. Global guardrails (apply to every plan)

1. **Work from the current working tree.** The branch `feat/settings-currency-audit` has
   uncommitted modifications across many files. NEVER run `git checkout --`, `git restore`,
   `git stash`, `git reset`, or anything that reverts working-tree changes.
2. **Never touch** `packages/database/migrations/0000`–`0059` (append-only ledger; new migrations
   start at `0060`), the other apps (`institution-web`, `parent-web`, `public-web`,
   `super-admin-web`) unless a plan explicitly names a file there, or `packages/config` beyond the
   exact lines a plan names.
3. **Never invent names.** Table, endpoint, block-type, and schema names come from
   `plans/00-overview.md` §6 (cross-plan contracts) or from existing code. If you need a name that
   doesn't exist there, use the plan's stated name.
4. **Product hard rules** (condensed from overview §4 — violating any of these is a bug):
   - No mastery percentages or composite scores anywhere. Evidence tags + counts only.
   - Quick Answer never auto-escalates into a lesson; follow-ups are opt-in.
   - Homework/assignment AI help is governed **server-side** by institution policy (Full /
     Concept-only / Off); it cannot be loosened from the client.
   - Chat (Ask Petros) is a side layer, never the primary surface; pinned answers become canvas
     note cards, unpinned chat is ephemeral.
   - No dark patterns: no guilt copy, no punitive states, calm amber (not red) for "late".
   - Everything AI-generated is visually marked (violet accent) with a "made from / FROM —" source line.
5. **Secrets:** `.env` contains a real `OPENAI_API_KEY`. Never print it into code, commits, logs,
   or plan reports. Never commit `.env`.
6. **No drive-by refactors.** Each plan's §6 lists what is out of scope. Fix only what the plan says.

## 6. Escalation rule

Each plan's "Current state" section describes the working tree as verified on 2026-07-07. Before
editing a file, re-confirm the described state (the plan gives re-check commands). **If reality
contradicts the plan — file missing, line moved substantially, behavior different — STOP, report
the discrepancy, and wait for the user. Do not improvise around it.** Silent improvisation is the
failure mode that caused half these bugs.

## 7. Definition of done (every plan)

- The plan's §5 verification gate passes with the exact expected outputs.
- `typecheck` passes for every package touched.
- No new console errors in the browser on the touched pages.
- Report a short PASS/FAIL table of the plan's acceptance criteria back to the user.
