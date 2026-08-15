# Petros Stage 12 implementation handoff

Status: **Stage 12 not complete**. The Stage 12 product scope and technical evidence described below exist,
but the combined Stage 9–12 acceptance gate remains open. This is not a production-readiness claim and Stage
13 has not begun.

## Implemented scope

- Versioned institution/campus/programme/grade/subject policy with tenant-validated scope, draft edit,
  preview/diff, scheduled or immediate publish, immutable session snapshots, rollback-as-new-version, explicit
  disclosure/publish confirmation, optimistic conflict checks, permission checks, recent-auth operations
  checks, and audit events.
- Syllabus source/grade/subject/topic/depth enforcement with a useful configured outside-scope path.
- Server-authoritative active-homework matching by assignment context, status, relation threshold, deadline,
  grace period, timezone, override, correction, and student-visible teaching-shape disclosure. The public
  client-spoofable match-decision route was removed.
- Exact teacher/parent visibility categories, purpose and retention; stable student disclosure; platform
  exclusions for raw/private/provider/credential/unsaved content; privacy sanitizers; export and deletion of
  student-owned Stage 12 data without deleting source learner evidence.
- Student-visible, editable, consented teacher handoff with configurable failed-repair threshold,
  cancellation window, class/subject teacher routing, status events, and privacy-safe summaries.
- Minimum-cohort/minimum-independent-evidence/freshness class signals with suppression and no student ranks,
  names, answers, or raw content.
- Guardian digest preferences, opt-out, language, source period, cadence, preview/send/cancel/retry/history,
  permitted sections, deterministic English/Hindi fallback, portal delivery, bounded exponential retry, and
  provider-neutral failure when email delivery is not configured.
- Aggregate, audited Super Admin policy/disclosure/suppression/delivery/function metrics and independent
  `institution.teacher_escalation_summary.generate` and `institution.parent_digest.generate` routing
  contracts. Provider/model details remain outside student and institution responses.
- Tracked `petros.institutional.delivery` delivery sweep every 60 seconds in BullMQ. Development without
  queues uses the same bounded idempotent sweep in-process and tears it down on shutdown.

Voice remains optional. All Stage 12 student interactions exercised here are text-complete.

## Data and runtime

- Migration: `packages/database/migrations/0199_petros_institutional.sql`.
- Schema contracts: `packages/schemas/src/petros-institutional.ts`.
- Database tables: nine Stage 12 tables; all nine have forced RLS and tenant policies.
- Applied migration verification: 28 Stage 12 indexes, 60 constraints, `max_retry_count INTEGER NOT NULL`.
- Synthetic transaction RLS probe under `edrion_app`: owner tenant visible `1`; other tenant visible `0`.
- Repeat migration run: passed with no new work; post-migration grants/RLS and visual-canvas backfill passed.
- First tracked delivery execution: background job `7f3de159-b581-421c-9959-eee82a3ed35d`, status
  `succeeded`, items processed `0`.
- No new environment variable is required. Email is deliberately unavailable until a real delivery adapter is
  configured; selecting it fails safely and retries within the policy cap.

## Automated evidence

Executed on 2026-08-13/14 against base commit `2556ba2bdfe744ab73d96f50bdec7219bb749ed2` with the
working tree's existing Stage 3–11 changes preserved.

| Check | Result |
| --- | --- |
| Stage 12 schemas | PASS — 4/4 focused tests |
| Stage 12 engine/service/permissions/jobs | PASS — 16/16 focused tests |
| Session intent | PASS — 11/11 |
| Petros loop policy | PASS — 18/18 |
| Student repair component | PASS — 11/11 |
| Stage 12 quality personas | PASS — 5/5 |
| API full suite | PASS — 67 files, 423 tests |
| Student web full suite | PASS — 6 files, 28 tests |
| Learn-evals full unit suite | PASS — 5 files, 46 tests |
| Full quality fixture | PASS — 240/240; 0 blocking, 0 warnings, 0 µUSD |
| Typechecks | PASS — schemas, database, API, student, Super Admin, learn-evals. Institution source check passed before build; after Next generated `.next/types`, the same unrelated approvals page export makes `tsc` fail |
| Builds | PASS — API, student, Super Admin. BLOCKED — institution Next build compiles, then rejects the pre-existing `RequestsInboxView` page export in `approvals/page.tsx` |
| Migration / RLS | PASS — apply + repeat apply + forced-RLS catalogue + rollback isolation probe |
| Root E2E command | BLOCKED — command exits 0 but Turbo reports 0 tasks; no package exposes `test:e2e` |
| Lint | BLOCKED — API/database/schemas lack the `eslint` binary; Next apps request first-time interactive ESLint configuration; learn-evals has no lint script |
| Format check | BLOCKED — repository Prettier configuration cannot resolve `prettier-plugin-tailwindcss` |
| Production dependency audit | FAIL — 63 findings: 2 critical, 27 high, 29 moderate, 5 low; includes Next 14.2.13 authorization-bypass/DoS advisories and other runtime/tooling advisories |
| Full schemas suite | FAIL outside Stage 12 — 340 pass, 2 pre-existing `student/exam-questions.spec.ts` failures; focused Stage 12 schemas pass |

Quality artifacts:

- `packages/learn-evals/eval-runs/petros-quality/petros-quality-full-fixture-42-1786644656476.json`
- matching `.md` and `.csv` files; SHA-256 hashes are in the technical ledger.

## Browser and accessibility evidence

The signed-in local technical pass covered institution admin, teacher, guardian, linked student, and Super
Admin accounts. It verified policy draft/preview/diff and publish confirmation; teacher policy denial;
teacher-support privacy copy; guardian preference persistence and policy-disabled digest failure; explicit
student session acceptance and stable disclosure; aggregate-only operations; and both Stage 12 routing
function entries. No browser console errors were observed on Stage 12 pages.

Institution policy, teacher support, guardian digest, student disclosure, and operations dashboard were checked
at 320, 390, 768, and 1440 CSS-pixel widths. All retained the primary heading and reported no document-level
horizontal overflow. Semantic snapshots contain labelled controls, headings, regions/tables, status and error
states. Full keyboard traversal, 200/400% zoom, screen readers, reduced-motion emulation, physical devices,
orientation, slow/offline recovery, and print/PDF still require the manual matrix.

See `docs/petros-stage-12-evidence/2026-08-14-technical-ledger.md` and the captured screenshots in
`docs/petros-stage-12-evidence/screenshots/`.

## Open acceptance and release gates

The following remain open and prevent both `Stage 12 complete` and production-readiness claims:

1. Stage 9 physical iPhone/Android, microphones/headsets/camera, language, network, retention, routing restore,
   accessibility, and privacy matrix.
2. Stage 10 consenting learner usefulness/repeat-use, fluent-language, teacher review, device, dashboard, and
   accessibility matrix.
3. Stage 11 learner usefulness, evidence fidelity, lifecycle, dashboard reconciliation, print, recovery,
   privacy, and assistive-technology matrix.
4. Stage 12 independent admin/teacher/parent/student reviewer sign-off, including clarity, dignity,
   usefulness, privacy, actionability, and the required questions/quotes.
5. Real Tenant A/Tenant B and campus/class/subject denial tests. The local database contains one institution;
   the synthetic rollback RLS probe is not a substitute.
6. Real above/below-threshold cohort fixtures, exhaustive handoff/cancel/read flows, full digest send/retry/
   cadence/other-parent denial, live job failure recovery, and dashboard/SQL reconciliation with ledger IDs.
7. Live AI route pause/malformed-output/fallback/cost/latency/retry/restore for both Stage 12 functions. The
   functions are registered but have no primary route in the local fixture.
8. Dependency remediation, repository lint/format tooling restoration, a real E2E task, the unrelated
   institution build export failure, and the two unrelated schema test failures.

Stage 13 prerequisites are therefore: close or formally disposition every blocker above; obtain signed
combined acceptance; retain route-restoration, cross-tenant, device, accessibility, privacy, and human-review
evidence; and rerun the full release suite. No Stage 13 work is included here.
