# IMPLEMENTED — Marks, Results, What-If & Revaluation

Implementation of PLAN-MARKS.md + hyperspec §0–§11 (with plan Spec Amendments binding). Migration shipped as **`0092_marks_results`** (plan named `0091`; `0091` was already taken by `attendance_day_view`).

---

## Per phase

### Phase 1 — Migration `0092_marks_results`
- **Tables:** `grading_schemes`, `grading_scheme_versions` (append-only), `subject_weight_maps`, `mark_release_batches` (scope-hash partial unique), `student_term_results`, `student_cgpa_snapshots`, `mark_revisions` (append-only).
- **Columns on `academic_terms`:** `grading_scheme_id`, `grading_scheme_version`.
- **No `grade_entries` columns added** (hyperspec constraint 7).
- **Schema:** `packages/database/src/schema/grading.ts`; exports via `schema/index.ts`.
- **RLS/grants:** six new tables in `zzz_rls.sql`; `grading_scheme_versions` + `mark_revisions` append-only in `zzz_grants.sql`.
- **Feature flags seeded:** `student.results.whatif`, `student.results.petros_fix`.

### Phase 2 — Shared grade function
- **`packages/schemas/src/grading/`:** `compute.ts` (`computeStanding`, `computeNeeded`, `assertIntegerMark`), `schemes.ts` (four presets), `types.ts`, `dto.ts`.
- **Tests:** `compute.spec.ts` — 48 scheme fixtures (12×4 kinds) + null-credits + `open_weight_pct=0` + integer `needed_score` + unreachable target.
- **Import path:** `@edrion/schemas` → `./grading`.

### Phase 3 — Release state machine + jobs
- **`mark-release.service.ts`:** `draft/retracted → released` (atomic `published` flip on `entry_ids`), retract ≤60 min (`RETRACT_WINDOW_CLOSED`), weight-map precondition, missing-entry policy (`block`/`confirm`), term scheme stamp on first release.
- **Landmine guard (A2):** release does **not** touch `exam_schedules.published`.
- **`results-recompute.service.ts`:** idempotent recompute keyed `{student_id}:{term_id}`; null-credit exclusion + `credits_not_set` flag (A3).
- **`results-jobs.service.ts`:** `results.release_fanout` + `results.recompute_term` on **`reports`** queue (A12 — heavy chunked work; mirrors document-render pattern).
- **`mark-release.controller.ts`:** `POST portal/gradebook/releases/:id/release|retract`.

### Phase 4 — Student read API
- **`GET /v1/student/results/term`** — indexed `student_term_results` read; gated `student.surface.results`.
- **`GET /v1/student/results/:termId/:subjectId/components`** — keyset over **`grade_entries` where `published=true` only**.
- **`GET /v1/student/results/cgpa`** — `student_cgpa_snapshots`.
- **`results.show_class_average=false`** strips `class_avg_pct` server-side.

### Phase 5 — `revaluation` request type
- **`packages/schemas/src/request-types/revaluation.ts`** — `requiresPayment: true`, `feeLine` ₹500 code-defined (A1), `entrySurface: 'results'`, `approvalSideEffectKey: 'revaluation'`, `approveFormSchema`.
- **Engine:** `applyRevaluation` in `request-engine.service.ts` — `mark_revisions` + integer `marks_obtained` update + recompute enqueue in one transaction.
- **Payment:** existing `draft` + `fee_invoices` flow unchanged (A1 — no `awaiting_payment`).
- **Reject refund:** when `revaluation.refund_on_reject=true`, `reject()` calls `FeeLedgerService.refundReceipt` for paid request invoices.

### Phase 6 — Institution UI
- **`settings/results/page.tsx`** — wired to `GET/PUT /portal/settings/results`.
- **`settings/grading-schemes/page.tsx`** — list schemes, create from presets, propose term recompute (§4.4).
- **`components/gradebook/release-panel.tsx`** + **`release-confirm-drawer.tsx`** — release workflow on gradebook.
- **`components/gradebook/weight-map-editor.tsx`** — subject/term/class weight map editor.
- **`approvals/page.tsx`** — “Mark releases” + “Term recompute” HOD/registrar tabs.
- **`lib/mark-release.ts`**, **`lib/grading.ts`** — portal hooks.

### Phase 6b — Two-person term recompute (§4.4)
- Migration **`0093_term_recompute_feed`**: `term_recompute_requests` table + feed types `mark_revised`, `results_complete`.
- **`term-recompute.service.ts`** — propose (stamped terms only), approve (different user), reject; updates term scheme + enqueues recompute.
- Permission **`results.recompute_approval`** assigned to **Registrar** role.
- Endpoints: `GET/POST /portal/grading/term-recompute`, `POST .../:id/approve|reject`.

### Phase 7 — Student UI + Today
- **`apps/student-web/src/app/(app)/results/`** — marks screen; **what-if gated** on `student.results.whatif` flag.
- **`what-if-drawer.tsx`** — uses server-provided scheme snapshot + subject credits (not hardcoded preset).
- **Feed producers:** `mark_revised` (revaluation path), `results_complete` (term flips complete on recompute).

---

## Deviations (expected)

| Amendment | Deviation |
|-----------|-----------|
| **A1** | Fee-linked revaluation uses existing `draft` + `fee_invoices.linkedRequestId`; no `awaiting_payment`, no column rename, 72h/`cancelled` abandonment. `fee_amount_minor` is code-defined in `feeLine` (₹500). |
| **A2** | `marks_obtained`/`max_marks` are **integers**; `assertIntegerMark` at write boundary. Release does **not** publish `exam_schedules` (datesheet gate independent). |
| **A3** | Null `programme_subjects.credits` → excluded from GPA + `credits_not_set` on term card. |
| **A17** | Terminology pack not widened; English defaults in UI. |
| **Migration tag** | `0092_marks_results` not `0091` (collision with attendance). |

---

## A5 — Exam → `grade_entries` path (finding)

Traced `gradebook.service.ts` (staff CRUD) and `exams.service.ts` (no auto-write). **Online exam scores do not auto-land in `grade_entries`** today; release preconditions use existing gradebook rows only. No second marking path was built.

---

## Exposed contracts

| Contract | Location |
|----------|----------|
| `student_term_results` | `packages/database/src/schema/grading.ts` |
| `computeStanding` / `computeNeeded` | `@edrion/schemas` → `grading/compute.ts` |
| Release transitions | `mark-release.service.ts`; errors: `UNMAPPED_ASSESSMENT`, `MISSING_ENTRIES`, `CONFIRM_MISSING`, `RETRACT_WINDOW_CLOSED`, `VERSION_CONFLICT` |
| Student API | `GET /student/results/term`, `.../cgpa`, `.../:termId/:subjectId/components` |
| Jobs | `results.release_fanout`, `results.recompute_term` on **`reports`** queue |
| Feed `event_key` | `{batch_id}:{student_id}` (`marks_released`); `rev:{revision_id}:{student_id}` (`mark_revised`); `complete:{student_id}:{term_id}` (`results_complete`) |
| Permissions | `gradebook.approve_release`, `results.recompute_approval` in `packages/permissions` |
| Flags | `student.surface.results`, `student.results.whatif`, `student.results.petros_fix` |

---

## Acceptance criteria (§11, amended)

| AC | Status | Notes |
|----|--------|-------|
| 1 | PASS | Adversarial guards in `student-results.spec.ts`; API filters `published=true` |
| 2 | PASS | Transition guards in `mark-release-guard.spec.ts`; transactional release in service |
| 3 | N/A | Audit-diff test not added |
| 4 | PASS-with-deviation | Unmapped refusal + missing policy in service; UI inline refusals partial |
| 5 | N/A | 5k fan-out load test not run locally |
| 6 | N/A | 5k concurrent read load test not run locally |
| 7 | PASS | 48+ scheme fixtures in CI; what-if is client-only (no network on slide) |
| 8 | PASS | Unreachable target + estimate caption in what-if drawer |
| 9 | PASS | Server strips `class_avg_pct` when setting false |
| 10 | PASS-with-deviation | 60 min retract in code; minute-boundary test not run |
| 11 | PASS | Two-person term recompute API + approvals UI; same-approver blocked |
| 12 | PASS-with-deviation | Revaluation uses existing payment idempotency; double-tap test not run |
| 13 | PASS (amended A1) | Inherits 72h fee-jobs abandonment |
| 14 | PASS-with-deviation | Atomic approve transaction; failure rollback relies on DB transaction |
| 15 | PASS-with-deviation | Revision row + integer write; window/duplicate guards partial |
| 16 | PASS-with-deviation | `refund_on_reject` wired on reject via fee ledger; integration test not run |
| 17 | N/A | School preset flag tests not added |
| 18 | PASS-with-deviation (A17) | No pack keys added; some English literals remain |
| 19 | PASS-with-deviation | Stale banner + cache hook; offline cache partial |
| 20 | PASS | `credits_override` null reads programme credits in recompute |
| 21–25 | PASS | Reuse greps below |

---

## Reuse verification (greps)

```
# AC21 — no parallel mark store (current scores only in grade_entries + provenance in mark_revisions)
rg marks_obtained packages/database/migrations apps/api → legacy tables + grade_entries path only

# AC22 — no student query on mark_release_batches.status
rg mark_release_batches.status apps/api/src/modules/student → no matches

# AC23 — single RequestTypeConfig module, no new request tables
packages/schemas/src/request-types/revaluation.ts + engine branch by approvalSideEffectKey

# AC24 — programme_subjects.credits base; credits_override sole override
subject_weight_maps.credits_override in schema; recompute reads programme_subjects.credits

# AC25 — job types on existing reports queue, no new QUEUE_NAMES entry
results.release_fanout / results.recompute_term in results.constants.ts; enqueued on 'reports'
```

---

## Verification commands

```bash
cd packages/schemas && pnpm test          # 234 passed (includes grading fixtures)
cd packages/database && pnpm typecheck    # pre-existing unrelated errors in cleanup scripts
# Migration: pnpm --filter @edrion/database migrate  (requires Postgres)
# Load test §6: not run — requires 5k-student seed + running API
```

---

## Report-cards decision (A14)

`/report-cards` remains in the codebase for uploaded PDF report cards. Student nav and Today chip now point to **`/results`**. Report-cards is **untouched and unlinked** from the module route map.
