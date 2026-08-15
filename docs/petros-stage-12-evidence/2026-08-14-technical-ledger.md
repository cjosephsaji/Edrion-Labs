# Petros Stage 12 technical evidence ledger — 2026-08-14

This ledger records a local technical pass, not human/device acceptance. Credentials, cookies, bearer tokens,
raw learner media, answers, and private questions are excluded.

## Run identity

| Field | Value |
| --- | --- |
| Run ID | `S12-TECH-20260813-01` |
| UTC window | 2026-08-13 18:13–18:29 UTC |
| Base commit | `2556ba2bdfe744ab73d96f50bdec7219bb749ed2` |
| Environment | Local development; Chromium in-app browser; synthetic/repository-owned fixtures |
| Institution | `27284a40-1166-4b73-aafc-f9906f468f73` (`Greenwood Academy`) |
| Campus | `98dd8412-cfa5-4286-a08f-f17c8a488748` (`Main Campus`) |
| Linked student | `88ab5c8e-c136-4b2d-9a08-46f7d5f74668` (repository fixture) |
| Published baseline policy | `0ac2f495-2b11-42b1-9d8e-c301a2f9d832` |
| Browser-created draft | `42f78caa-df9a-461a-b8e3-60f6579358c0`; remains a draft |
| Technical session | `9589cd55-5030-44be-ab3c-b08656f56539`; text-only contextual session |
| Stable policy snapshot | `354265ce-7777-4a4f-9945-919aafd78169`; `stable_for_session=true` |
| Delivery job | `7f3de159-b581-421c-9959-eee82a3ed35d`; succeeded; 0 items |

Only one institution exists in this local fixture, so `TENANT-B-*` scenarios are open. The SQL rollback probe
used temporary synthetic tenant UUIDs and committed no fixture rows.

## Combined Stage 9–12 matrix

| Stage/scenario | Technical observation | Status | Required evidence still missing |
| --- | --- | --- | --- |
| 9 physical inputs | Not repeated; prior implementation handoff only | OPEN | Entire physical-device, microphone/headset/camera, language, network, routing, retention, privacy, accessibility matrix |
| 10 Teach-it-back | Not repeated; automated suite retained | OPEN | Consenting learner usefulness/repeat-use, fluent reviewers, teacher review, devices, routing restore, dashboard reconciliation |
| 11 reflection | Not repeated; automated suite retained | OPEN | Human usefulness/evidence review, lifecycle fixtures, privacy/export/transfer, assistive technology, print, slow/offline/stale recovery |
| 12.1 policy lifecycle | Admin created campus draft, previewed selected policy, saw section/disclosure diff; publish stayed disabled until disclosure checkbox; draft was not published | PARTIAL | Future/current activation, browser rollback/restore, concurrent edit, second-tenant non-effect, independent admin review |
| 12.2 syllabus boundary | Deterministic engine/service/quality cases pass | PARTIAL | Human in-bound/deeper/out-of-bound phrasing review against a published real syllabus fixture |
| 12.3 active homework | Server-authoritative engine/service/loop tests pass; seed homework page exposed no Stage 12 Petros door because its existing assignment AI policy is off | PARTIAL | Browser before/during/after, submitted/extended/late/unrelated/override/correction matrix and teacher/student review |
| 12.4 disclosure/access | Student accepted a text session; exact teacher/parent categories, purposes, retention and next-session stability were visible; teacher policy route returned `petros.policy.view` denial | PARTIAL | Field-for-field access reconciliation after mid-session publish with second tenant and underprivileged parent/teacher fixtures |
| 12.5 teacher handoff | Threshold/routing/privacy/cancel/job tests pass; teacher inbox showed a privacy-safe empty state | PARTIAL | Human exhausted-repair offer/edit/consent/deliver/read/cancel, correct assigned teacher, withdrawal timing |
| 12.6 class signals | Cohort threshold/suppression/routing tests pass; teacher surface showed no eligible signals | PARTIAL | Real above/below-threshold class cohorts, freshness/uncertainty review, re-identification challenge, SQL/dashboard reconciliation |
| 12.7 parent digest | Guardian preference persisted Hindi across reload and was restored to English; preview failed honestly because effective policy disables digests; retry/cadence/localization tests pass | PARTIAL | Published-enabled preview/send/history/opt-out/cadence, real retry/exhaustion, another-parent denial, fluent Hindi review |
| 12.8 institution dashboard | Policy editor/version/disclosure/platform limits and explicit acceptance-open copy rendered | PARTIAL | Scheduled/effective/audit reconciliation and institution-admin reviewer sign-off |
| 12.9 human review | No independent reviewers were available | OPEN | Teacher, parent, institution admin and consenting learner assessments, quotes and required satisfaction answers |
| 12.10 operations/routing | Aggregate-only dashboard showed 2 policy versions, 1 snapshot, 0 drift, no content, production readiness false; both independent function contracts visible | PARTIAL | Live route configure/pause/malformed/fallback/cost/latency/retry/restore with correlation and attempt IDs |
| 12.11 privacy/export/deletion | Permission tests, privacy sanitizers, export/deletion unit paths, forced-RLS catalogue and temporary cross-tenant rollback probe pass | PARTIAL | Two real browser profiles/tenants, campus/class/subject denials, disposable export/delete readback and audit review |
| 12.12 accessibility/recovery | All five Stage 12 surfaces retained headings and had no document horizontal overflow at 320/390/768/1440; semantic labelled-control/region/table/status/error trees captured | PARTIAL | Keyboard-only end-to-end, VoiceOver/TalkBack/NVDA, 200/400% zoom, orientation, reduced motion, high contrast, print/PDF, slow/offline/stale/job failure |

Combined decision: **not complete**. Every `OPEN` or `PARTIAL` row remains an acceptance gate.

## Browser observations

- Admin: draft v1 campus policy created; selected-version preview returned changed sections `digest`,
  `homework`, `syllabus`, `escalation`, `visibility`, `classSignals`; disclosure changed `yes`; publish button
  changed from disabled to enabled only while the explicit confirmation was checked. It was unchecked again.
- Teacher: `/petros-support` showed separate handoff and class-signal regions and stated exclusions for raw
  answers/rankings/hidden reasoning/provider details/below-threshold identities. Direct policy access failed
  uniformly for missing `petros.policy.view`.
- Guardian: English/Hindi preference persisted through reload and was restored to English. Digest preview was
  refused with `PETROS_DIGEST_DISABLED` under the effective baseline rather than fabricating content.
- Student: contextual session began only after `Accept and start session`; policy disclosure was a named region,
  listed exact audiences/purposes/retention, stated next-session stability, and said voice is optional/text
  complete. Acknowledgement emitted a status message.
- Super Admin: `/ai/petros-institutional` remained aggregate-only and explicitly false for production
  readiness. `/ai/petros-routing` listed both Stage 12 function contracts; neither had a primary route.
- Console: no Stage 12 page errors. One Next navigation warning about a sticky header was observed on the
  operations page.

## Responsive evidence

For each surface below, measurements at 320/390/768/1440 CSS pixels showed
`documentElement.scrollWidth <= innerWidth + 1` and a visible primary heading:

- institution policy;
- teacher support;
- guardian digest;
- student policy disclosure/session;
- aggregate operations dashboard.

This does not substitute for physical orientation, zoom, reader, keyboard, reduced-motion, or network checks.

## Artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `screenshots/STAGE12-GUARDIAN-DIGEST.png` | `da9fe043f605b4d00498dd713596ab7827580e8d62bd1d22978872a4d6084d63` |
| `screenshots/STAGE12-INSTITUTION-POLICY-390.png` | `ab4e47f2e533b5f66976d09ce2f0bdf3f32bb3d30f33fef6216ccf9b58caf73b` |
| `screenshots/STAGE12-INSTITUTION-POLICY-DESKTOP.png` | `d7e197417ec6f0e98abf65276d1545e8f8b25db53d21c60ca7b1ad6c515761a9` |
| `screenshots/STAGE12-INSTITUTION-POLICY-PREVIEW.png` | `19786a93c7abfdcec664c63c50bf458ab3eb3df3734d02182b0b3c822b0652ba` |
| `screenshots/STAGE12-OPERATIONS-DASHBOARD.png` | `9f846931a204730da759638c10aca87e4c52eb71f597c00a059a0509c63e8f31` |
| `screenshots/STAGE12-STUDENT-DISCLOSURE-390.png` | `7ba199496000add4f89338222bed5a821de72a18c0cf279e1a400dc6de855457` |
| `screenshots/STAGE12-TEACHER-SUPPORT.png` | `fa5b19597eb06b5dc4f484af614a8c8f63d773d70825e5b4accb1bd1fdce62e1` |
| quality JSON | `c1444eed075330bf55d64866cb37db807820ee987fc647d8a7de3cc38468b216` |
| quality Markdown | `2a563795aae82a6fe9d7fd711e3b8300965e6fc48af38b8b1d6dc24cdc7f0750` |
| quality CSV | `bb2fb7fea6409af482dcba153566bcc94668054712b1ec7a3f1dcdbe52465c0d` |

## Continuation run — S9-12-CONT-20260814-01

This continuation run completed the available local browser/device checks on 2026-08-14. It does not promote
the combined human/device gates to acceptance.

| Check | Observed result | Status |
| --- | --- | --- |
| Desktop microphone grant/recheck | Browser returned `Permission denied by system` after the grant attempt; `permission_denied` event retained | FAIL |
| Android physical microphone | Real Samsung SM-S921B/Brave captured three turns (5.808s, 5.257s, 5.044s); replay control rendered; no transcript returned | PARTIAL — capture/replay pass, STT fail |
| Android background/lock stop | `background_stop` event recorded; subsequent media cleanup emitted `deleted` events | PASS for stop/cleanup evidence |
| Text fallback | Switched to text, acknowledged disclosure, started target, submitted a correct answer with uncertainty; deterministic fallback continued the session | PASS |
| Teach-it-back | Start request returned `Something went wrong`; API log: `petros_learning_sessions_type_ck` constraint violation | FAIL |
| Reflection `/progress` | Page returned `Couldn’t load this page`; API returned 500; log: duplicate `petros_reflection_map_snapshot_concept_uniq` | FAIL |
| Targeted API tests | 11 Petros spec files, 95 tests passed | PASS |
| QA cleanup | Test session `1493f773-cd62-4b30-a9e5-4fec98de7e72` closed with `student_stopped`; no new active session left by this run | PASS |

Continuation artifacts are hashed below. The physical iPhone, headset matrix, assistive technology, second-tenant,
human reviewer, and institutional dashboard gates remain open.

| Artifact | SHA-256 |
| --- | --- |
| `S9-12-CONT-20260814-01-android-voice-capture-replay-20260814T132149Z.png` | `01c3943f0bfbbccae2118008cb804c9cec845ef00f8471d090293a2dac360155` |
| `S9-12-CONT-20260814-01-desktop-microphone-denied-20260814T132000Z.png` | `c8e7a3be46d13004336c8616cfce49f0b5743c918c177d6199bfab742e3203eb` |
| `S9-12-CONT-20260814-01-stage10-teachback-start-error-20260814T132500Z.png` | `e71e1862b8b17c85fb43d9c045b10cf2d8451c850e92433960669d68bb0417d5` |
| `S9-12-CONT-20260814-01-stage11-progress-error-20260814T132400Z.png` | `d898fbf7b354813b7d9271855c20fa553234a2aa0a6b3ee2ac7413339710e2ad` |

## Tooling and release blockers

- Final API regression: 67 test files, 423 tests passed; API build passed.
- `pnpm audit --prod --audit-level high`: 63 vulnerabilities (2 critical, 27 high, 29 moderate, 5 low).
- Institution build compiles Stage 12, then fails on the pre-existing invalid `RequestsInboxView` export in
  `src/app/(app)/approvals/page.tsx`; once `.next/types` exists, the institution `tsc` check reports that same
  export while the other requested typechecks pass.
- Full schemas: 340 pass, 2 unrelated exam-question failures.
- `pnpm test:e2e`: zero tasks exist.
- Lint/format infrastructure is unavailable as described in the Stage 12 handoff.
- API boot also reports unrelated existing maintenance failures for missing
  `compliance_evidence_artifacts`/`principal_metric_rollups` and a missing `library.daily_reminder` handler.

## Remediation run — S9-12-FIX-20260814-01

The two application failures were fixed and rechecked locally after migration `0200_petros_failure_fixes`.

| Check | Observed result | Status |
| --- | --- | --- |
| Teach-it-back persistence | `POST /v1/student/petros/teach-it-back/sessions` returned 201 and rendered the active session in the student browser | PASS |
| Reflection persistence | `GET /v1/student/petros/reflection` returned 200; `/progress` rendered the knowledge-map surface without the load error | PASS |
| Duplicate concept protection | Reflection derivation now normalizes duplicate concept IDs before map/recommendation/relationship persistence; regression test added | PASS |
| API regression | 67 files, 424 tests passed | PASS |
| Student Petros UI tests | 6 files, 28 tests passed | PASS |
| API typecheck | `pnpm --filter @edrion/api typecheck` passed | PASS |
| Database typecheck/migration | `0200_petros_failure_fixes` applied; database typecheck passed | PASS |
| Institution typography | Institution and Super Admin computed body/display fonts remain aligned; institution typecheck passed | PASS |
| Voice STT | Capture/replay and text fallback remain functional, but this local database has no enabled speech-capable provider route; physical OS microphone permission is still an external acceptance gate | OPEN — configuration/device |

The remaining voice item is intentionally not masked with a fake transcript: configure an enabled provider/model
with `audio_input` and `speech_to_text` capabilities, then repeat the physical microphone and mixed-language QA.
