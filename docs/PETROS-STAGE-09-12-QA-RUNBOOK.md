# Petros combined Stage 9–12 acceptance runbook

Status: **partially executed; combined acceptance open**. A local Stage 12 technical/browser pass was recorded
on 2026-08-13/14. It is not evidence that Stage 9, 10, 11, or 12 passed its human/device gate.

Stage 12 now has an implementation handoff and technical ledger:
[PETROS-STAGE-12-HANDOFF.md](./PETROS-STAGE-12-HANDOFF.md) and
[2026-08-14-technical-ledger.md](./petros-stage-12-evidence/2026-08-14-technical-ledger.md). The ledger marks
each Stage 12 row `PARTIAL` or `OPEN`; no row may be promoted from automated tests or screenshots alone.

## Gate order and stop rules

Run in this order so later findings rely on trustworthy earlier inputs:

1. Stage 9 physical input/device matrix and privacy/routing reconciliation.
2. Stage 10 Teach-it-back human usefulness, repeat-use, optional-voice, dashboard, and quality review.
3. Stage 11 reflection usefulness, evidence fidelity, lifecycle, dashboard, privacy, and accessibility review.
4. Stage 12 cross-role policy/human-loop acceptance after the still-open Stage 9–11 gates and with the
   independent people, devices, and fixtures required below.

Stop the pass and file an issue if a scenario exposes another learner's existence/content, leaves a physical
microphone active after stop/background/close, loses the learner's text, presents an inference as fact, changes
marks from informal evidence, leaks a provider/key, or makes enforced visibility differ from the student
disclosure. Restore every paused AI route and reversible policy before continuing.

No stage gate may be inferred from an automated test, screenshot alone, completion count, or another stage's
result. Voice remains optional throughout; every voice scenario must also complete through text.

## People, accounts, devices, and fixtures

Record real UUIDs in the evidence ledger; never place credentials in evidence.

| Label | Required setup |
| --- | --- |
| `TENANT-A-STUDENT-NODATA` | Tenant A learner with published syllabus and zero learner evidence |
| `TENANT-A-STUDENT-MIXED` | Tenant A learner with solid, shaky, untouched, insufficient-evidence, fresh, aging, and stale topics |
| `TENANT-A-STUDENT-CAL-OVER/UNDER/ALIGNED/LOW` | Four disposable learners with paired confidence/outcome histories; low has fewer than 8 pairs |
| `TENANT-A-STUDENT-RECAP` | Sessions seeded for diagram use, notation delay, recovery, hint, and a neutral control |
| `TENANT-A-STUDENT-GAP` | Three or more independent recent errors across at least two affected topics sharing one published prerequisite |
| `TENANT-A-STUDENT-UNRELATED` | Recent doubts with unrelated prerequisites; must not form a confident cluster |
| `TENANT-B-STUDENT` | Same-looking data in a second tenant for denial/existence-leak checks |
| Roles | Tenant A institution admin, teacher, parent, student; Tenant B equivalents; Super Admin with `ai.view`; reversible route operator with `ai.manage` |
| Human review | At least two consenting learner reviewers, one fluent reviewer per enabled language pair, one teacher reviewer, one parent reviewer, one institution-admin reviewer |
| Physical devices | Current iPhone Safari, Android Chrome, desktop Chrome and Firefox; built-in/wired/Bluetooth microphones/headsets; camera; keyboard; printer/PDF target |
| Assistive technology | VoiceOver, TalkBack, and NVDA or equivalent; keyboard-only; 200% and 400% zoom; reduced motion |
| Network states | Normal, slow 3G, offline/reconnect, provider route paused, API failure, and stale-data fixture |

Use licensed, synthetic, or repository-owned media. Use disposable learner records for deletion/export and
false-positive/correction exercises. Never capture cookies, bearer tokens, raw database credentials, another
learner's content, or unredacted voice/image media in an operations screenshot.

## Evidence package and naming

Create one ledger row per scenario with:

- run ID, stage/scenario ID, UTC start/end, build commit, environment, reviewer role/pseudonym;
- tenant/institution/student fixture IDs and exact evidence-seed manifest/hash;
- device model/OS, browser/version, viewport, input device, assistive technology, network state;
- session, intent, recommendation, snapshot, map-state, recap, alarm, media, job, artifact, event,
  correlation, audit, routing-attempt, function, provider/model-route-reference, policy-version, handoff,
  digest, and delivery IDs when applicable;
- before/action/after screenshots, screen-reader transcript or notes, stopped-microphone evidence, print/PDF,
  API response redacted to schema, filtered dashboard export, SQL aggregate/readback, audit row, and route
  restoration proof;
- expected versus observed UI/backend/dashboard result, pass/fail, issue link, reviewer quote, and answers to
  the scenario satisfaction questions.

Name files `RUNID-STAGE-SCENARIO-UTC-KIND.ext`. Hash every artifact, put raw learner media in the approved
restricted QA store only, and put redacted evidence in the review bundle. A screenshot without its IDs,
timestamp, fixture manifest, and expected/observed ledger entry is not acceptance evidence.

## Stage 9 — physical input modes (open gate)

Execute all 12 scenarios in [the Stage 9 handoff](./PETROS-STAGE-09-HANDOFF.md#mandatory-manual-qa-and-dashboard-acceptance-runbook).
The combined pass must at least cover:

1. iPhone and Android clear-photo crop/rotate/extract/correct/stuck-point/opening/first-block flow.
2. Rotations, glare, low light, multiple questions, diagrams, handwriting overlap, invalid MIME/size/
   resolution, quarantined malware fixture, scanner outage, bounded retry, cancel/retake/text fallback.
3. Multi-page handwriting ordering, recognition correction, accessible overlay/list parity, feedback and
   Repair reattempt.
4. Photo/handwriting accessibility under low light, keyboard, VoiceOver/TalkBack, zoom, and text fallback.
5. Built-in/wired/Bluetooth microphone capture on both phones: permission denial/grant, recording-off
   default, timer, replay/caption, transcript correction, mute, interruption/new turn, pause/resume,
   background/lock/close stop, switch to text, and media expiry/deletion.
6. Walking/noise, airplane/reconnect, throttling, STT/TTS/route failure, provider pause/fallback/restore.
7. Every enabled language pair with a fluent human reviewer; preserve formulas and technical terms; no
   identity/mood/proficiency inference.
8. Five-minute mode with an external stopwatch: exactly four moves, finite close, explicit artifact save or
   decline, and longer-session offer only after close.
9. `/ai/petros-routing`: capability match, seven input-mode functions, cost/latency/retry/fallback/validation,
   sensitive-media cache bypass, audited route changes, exact restore.
10. `/ai/petros-modalities`: volume, corrections, job/storage/retention, failures, mismatch, fallback, cost,
    content-free aggregates, audited view.
11. Two-profile tenant denial, owner hash isolation, deletion/expiry, consent/retention, no raw content in
    admin/support responses.
12. 320/390/768/1440 widths, orientation, 200/400% zoom, keyboard/readers, reduced motion, offline/recovery.

For every physical scenario, ask: “Could you finish without voice?”, “Did the transcript preserve your
meaning?”, “Was it obvious when the microphone was on and off?”, and “Did recovery preserve your work?” Fail
if any essential instruction is audio-only, if physical device/browser evidence is missing, or if
`productionDeviceQaPassed` changes before the whole matrix reconciles.

## Stage 10 — Teach-it-back human acceptance (open gate)

Execute all 11 scenarios in [the Stage 10 handoff](./PETROS-STAGE-10-HANDOFF.md#mandatory-manual-qa-and-dashboard-acceptance-runbook),
using the same Stage 9 device records for optional voice. Required combined coverage:

1. Strong photosynthesis explanation: no invented gap, specific nonnumeric verdict, no auto-save/ability
   praise; ask whether Petros listened and whether another topic would be chosen without a reward.
2. Fluent electric-current explanation missing one causal link: exactly one relevant evidence-linked junior
   question.
3. Confident seasons misconception: two distinct probes maximum, respectful correction, help after cap.
4. Osmosis “I don't know”/Hint/Skip/revise flows: useful bridge, stale question retired, text preserved.
5. Optional voice matrix from Stage 9, including corrected low-confidence STT and a complete text path.
6. Verdict and artifact ownership: evidence for every claim, edit/select/save/discard, idempotent one-save,
   never change official marks.
7. Voluntary repeat with no reward, streak, urgency, or conversion pressure. Require credible positive reasons
   from at least two reviewers; completion alone is not success.
8. `/ai/petros-teach-back` trace from owner-private segment to aggregate functions/evidence/proposal without
   raw explanation or identity.
9. `/ai/petros-routing` pause each of the three dedicated functions, verify honest deterministic/fallback
   output and metering, restore routes.
10. Human adjudication of all six quality personas; record relevance, respect, usefulness, naturalness and
    any disagreement with the deterministic rubric.
11. Cross-tenant denial, accessibility/responsiveness, slow/offline/conflict/reload, text-only completeness,
    and content-free audited operations.

Ask after first and repeat sessions: “Did Petros listen more than it talked?”, “Was the question specific and
genuinely useful?”, “Did the correction preserve dignity?”, “Would you voluntarily teach another topic now,
without a reward?”, and “Why or why not?” Fail on a third probe, generic pestering, unsupported evidence,
ability language, automatic artifact save, raw speech in admin, or a claimed repeat-use pass without the two
positive qualitative reviews.

## Stage 11 — reflection surfaces (open gate)

### 11.1 Knowledge map usefulness

- **Account/navigation/setup:** sign in as `TENANT-A-STUDENT-MIXED`; `/progress`; use the frozen published
  topic/prerequisite manifest and evidence ledger.
- **Actions:** identify the highest action without opening “Why this?”, then open it; inspect its point reasons
  and evidence age. Traverse solid/shaky/untouched/insufficient topics, prerequisites/dependents, fresh/aging/
  stale evidence, legend, exam/path relevance, evidence details, visual map and accessible table.
- **Expected UI:** at most four actions; untouched explicitly says no learner evidence and never “weak”; the
  top action, reason, uncertainty and age are understandable in seconds; state is not color-only.
- **Expected backend/dashboard:** snapshot/schema/algorithm/source hash; exact topic coverage; map state and
  evidence links owner-scoped; published graph IDs; missing-link and lag counts reconcile at
  `/ai/petros-reflection`; no names/content in aggregate response.
- **Fail:** opaque rank, invented weakness/evidence/exam, visual/list mismatch, missing state name, infinite
  feed, ability/public comparison, or reviewer cannot answer what next and why within 10 seconds.
- **Ask/capture:** “What should you do next?”, “Why?”, “What is uncertain?”, “Does ‘not attempted’ feel
  accurate?” Capture visual/list/legend/detail, top recommendation ID/reasons, snapshot/event/audit IDs.

### 11.2 Map action and evidence-driven update

- **Account/navigation/setup:** same learner; record current snapshot, source-through time, recommendation and
  concept evidence count.
- **Actions:** recommendation → action preview; inspect Stage 8 goal/scope/reason/return route; explicitly start,
  complete checked work, close, wait only the documented processing interval, return `/progress`, rebuild.
- **Expected UI:** preview precedes start; Repair/Learn/Revise matches recommendation; map shows stale until
  processed if applicable; after new evidence, recommendation state/rank updates for an explained reason.
- **Expected backend/dashboard:** `reflection_action` intent and source fingerprint; shared session engine;
  owner evidence after recommendation `updatedAt`; prior recommendation becomes completed; one completion
  event and new source-hash snapshot; counts/outcome reconcile without engagement conversion metrics.
- **Fail:** session starts without consent, scope differs, start alone changes mastery, duplicate snapshot/event,
  update before evidence, unexplained delay, or another learner changes.
- **Ask/capture:** “Did the preview match what happened?”, “Did the changed map make sense?” Capture both
  snapshots, intent/session/evidence/recommendation/completion IDs and processing timestamps.

### 11.3 No-data learner

- **Account/navigation/setup:** `TENANT-A-STUDENT-NODATA`; published syllabus only.
- **Actions:** open `/progress`, both map modes, topic detail, empty recommendations; print/export.
- **Expected UI:** topics are untouched, mirror hidden, no recap/alarm, no invented weakness; legitimate path
  link; usable loading/empty text.
- **Expected backend/dashboard:** zero learner evidence; low-evidence/coverage counts and missing links match;
  export contains derived empty/untouched view only.
- **Fail:** shaky/solid, confident gap, calibration score, fabricated evidence, blank/error-only surface.
- **Ask/capture:** “Does the product admit what it does not know?” Capture empty/untouched UI, snapshot/export.

### 11.4 Calibration matrix and lifecycle

- **Account/navigation/setup:** over/under/aligned/low learners with exact confidence/outcome pairs, at least
  four recent and eight total for eligible fixtures.
- **Actions:** open `/progress`; independently calculate means/gap/trend; inspect Why; open fragile-topic
  preview where offered; quiet 30 days; verify core map/action still works; advance clock/fixture; dismiss.
- **Expected UI:** low sample hidden; eligible language is gentle (“gap is narrowing” where true), directional,
  uncertain, noncompetitive and not a permanent score; quiet/dismiss is immediate and accessible.
- **Expected backend/dashboard:** paired-evidence IDs/math, threshold/version, status/quiet-until and content-free
  events; eligible/hidden/quieted/dismissed counts reconcile; no individual comparison.
- **Fail:** low sample shown, false precision/trait/shame, core functionality removed, quiet ignored, wrong math.
- **Ask/capture:** “Did this feel useful rather than judgmental?”, “What action would you take?” Capture manual
  calculation, all four UIs, insight/evidence/event IDs and dashboard delta.

### 11.5 Session recaps

- **Account/navigation/setup:** `TENANT-A-STUDENT-RECAP`; close separate diagram, notation-delay, recovery, and
  neutral-control sessions.
- **Actions:** `/progress` → How you learned; open Evidence and limits; compare every observed fact/citation to
  session moves/observations; inspect tentative inference; correct one recap; dismiss another; rebuild.
- **Expected UI:** concise session-specific process recap; facts and “Tentative” separate; strategy/effort, no
  innate ability/durable preference; correction/dismiss works; nothing auto-saved as artifact.
- **Expected backend/dashboard:** versioned validated recap; independent function route or deterministic
  fallback; exact evidence subset; correction owner-private and excluded from aggregates; status persists;
  generation/validation/correction/dismissal/cost/latency reconcile.
- **Fail:** unsupported fact, one-session learning style, ability praise, missing citation, correction leakage,
  auto-save, or invalid AI output displayed as validated.
- **Ask/capture:** “Is this faithful to what happened?”, “What is fact versus inference?”, “Would you keep or
  correct it?” Capture session trace, recap/content version, evidence links, correction, event/attempt IDs.

### 11.6 Clustered prerequisite gap

- **Account/navigation/setup:** `TENANT-A-STUDENT-GAP`; Thermodynamics-like two-topic fixture with at least three
  independent recent error/doubt source-event IDs sharing one published prerequisite.
- **Actions:** open affected map topics, related hypothesis, Gap alarms; inspect support, confidence, estimate,
  and Why; verify one deduplicated alarm; open Repair preview; snooze 14 days; advance fixture; resolve after
  checked repair evidence.
- **Expected UI:** explicitly “Prerequisite hypothesis”; affected topics/evidence and practical minutes; one
  alarm; no nagging while snoozed; Stage 8 Repair scope matches prerequisite.
- **Expected backend/dashboard:** deterministic cluster fingerprint/minimum thresholds; at most optional
  validated explanation call; owner lifecycle; alarm candidate/snooze/resolve/repair outcome and confidence
  reconcile.
- **Fail:** fact language, duplicate alarm, dependent topics omitted, under-threshold cluster, snooze ignored,
  intent mismatch, engagement pressure.
- **Ask/capture:** “Why did this appear?”, “Does the proposed repair feel proportional?” Capture graph/evidence
  manifest, alarm/fingerprint/recommendation/intent/session/events and before/after dashboard.

### 11.7 Unrelated doubts and false-positive reporting

- **Account/navigation/setup:** `TENANT-A-STUDENT-UNRELATED`; three recent doubts with different prerequisites.
- **Actions:** rebuild; confirm no alarm. In a disposable clustered fixture, choose “These are unrelated,” add
  the bounded reason if offered, rebuild.
- **Expected UI:** no confident shared prerequisite for unrelated fixture; false-positive control removes the
  alarm and core learning remains.
- **Expected backend/dashboard:** no candidate for unrelated evidence; false-positive status/event persists by
  fingerprint, reason remains private, aggregate false-positive count increments without free text.
- **Fail:** confident false cluster, repeated alarm, reason in aggregate/admin, lack of correction path.
- **Ask/capture:** “Would you trust this system to admit a mistaken connection?” Capture zero-candidate query,
  false-positive event and aggregate delta.

### 11.8 Reflection operations reconciliation

- **Account/navigation/setup:** Super Admin `ai.view`; retain fixture ledger from 11.1–11.7.
- **Actions:** `/ai/petros-reflection`; filter Tenant A; reconcile snapshot status/versions/lag/missing links,
  state coverage, recommendation intent/completion, calibration, recaps and alarms. Use the separate individual
  evidence endpoint only with recent authentication and an approved disposable learner.
- **Expected UI/backend:** aggregate-only/no comparison/no content; exact counts; evidence call requires
  `ai.view` + recent auth and writes immutable audit; underprivileged call denied uniformly.
- **Fail:** names/raw answers/correction/reasons in aggregate, unexplained delta, individual ranking, unaudited
  evidence, weak permission.
- **Ask/capture:** operator: “Can reliability be diagnosed without reading learner content?” Capture filters,
  redacted API/SQL reconciliation, audit and sampled evidence authorization IDs.

### 11.9 AI Routing pause/fallback/cost

- **Account/navigation/setup:** reversible `ai.manage` route operator; baseline export.
- **Actions:** `/ai/petros-routing`; inspect `reflection.session_recap.generate` and
  `reflection.gap_explanation.generate` independently; run one valid case each; pause each route separately;
  trigger recap/alarm; verify deterministic fallback; submit malformed structured output in test adapter; restore.
- **Expected UI/backend:** independent budgets/capabilities/prompts/schemas/attempts; validation failure marked;
  fallback remains useful/provider-neutral; retry/cost/latency/fallback reconcile in both dashboards; no raw
  student answer or chain-of-thought stored.
- **Fail:** core surface breaks, provider leaks, invalid output accepted, unmetered call/budget bypass, route not
  restored.
- **Ask/capture:** “Was degradation honest and usable?” Capture baseline/pause/fallback/restore, attempt/event IDs.

### 11.10 Privacy, export/deletion/transfer, and no-dark-pattern review

- **Account/navigation/setup:** isolated Tenant A/B browser profiles; disposable derived data; reviewer copy
  checklist.
- **Actions:** replay every A map/insight/evidence/action ID as B; test institution mismatch; inspect 404/denial;
  export; delete Stage 11 derived data; confirm source learner evidence remains; rebuild; run authorized transfer
  fixture and verify restricted syllabus links excluded/rebuilt. Search all visible states for shame, urgency,
  streak repair, ability, follower/feed/leaderboard/public comparison.
- **Expected UI/backend:** no existence leak; owner+tenant scope and forced RLS; export only authorized derived
  view; cascade delete; source evidence retained; transfer rebuild semantics visible; aggregate/audit content-free.
- **Fail:** any cross-owner signal/content, deletion removes durable source evidence unexpectedly, restricted
  link transfers, provider/internal data in export, dark pattern or infinite feed.
- **Ask/capture:** “Did any copy pressure, rank, shame, or compare you?” Capture denials, RLS policy/readback,
  export hash, row counts before/delete/rebuild/transfer, copy checklist and audits.

### 11.11 Accessibility, responsive, print, stale, and recovery

- **Account/navigation/setup:** mixed/no-data fixtures; mobile/desktop devices and assistive tech listed above.
- **Actions:** keyboard-only visual map (arrow keys, Tab escape), list parity, zoom/pan, 200/400% browser zoom;
  VoiceOver/TalkBack/NVDA; color-blind/high-contrast inspection; 320/390/768/1440 widths; reduced motion;
  print/PDF; slow 3G; offline/reconnect; stale graph/evidence; API error/retry; dismiss/correct/snooze controls.
- **Expected UI:** no focus trap/hidden content/horizontal loss; state names independent of color; semantic
  headings/table/status/errors; readable mobile/print; motion reduced; stale is explicit and blocks unsafe
  action; retry preserves work; voice never required.
- **Expected backend/dashboard:** bounded requests/no duplicate rebuild/intent/lifecycle event; stale comparison
  uses graph/evidence timestamps; errors provider-neutral; print/export contains no hidden/private material.
- **Fail:** inaccessible map without list, trapped focus, color-only meaning, essential motion/audio, stale action
  silently starts, lost correction, duplicate command, unreadable print/mobile.
- **Ask/capture:** “Could you complete this without sight, color, mouse, audio, or fast network?” Capture reader
  notes/tree, focus order, viewports, zoom, reduced-motion CSS observation, PDF, network/stale/error IDs.

## Stage 12 — institutional boundaries and human loop (technical pass recorded; acceptance open)

The 2026-08-13/14 local pass used separate institution-admin, teacher, parent, student and Super Admin
sessions. It verified the technical observations in the ledger, but only one institution, one browser engine,
no physical devices, and no independent human reviewers were available. Execute every remaining row with the
required Tenant A/Tenant B fixtures, devices, and reviewers before changing the gate:

1. Policy draft/preview/test/publish/effective activation/session snapshot/diff/audit/rollback and no
   cross-institution effect.
2. In-bound, deeper-than-allowed and out-of-bound syllabus requests with a useful allowed path, never empty
   refusal or hallucinated syllabus.
3. Related homework before/during/after window plus submitted/extended/late/unrelated cases; teaching shape
   changes only in the valid window and disclosure explains it.
4. Student visibility disclosure compared field-for-field with teacher/parent access; mid-session policy
   stability; underprivileged denial. Any mismatch stops the combined pass.
5. Exhaust struggle path; student-visible teacher-handoff offer/preview/edit/consent/deliver/status/cancel;
   correct teacher route; private/raw/provider/unsaved content excluded.
6. Above-threshold and below-threshold class cohorts; useful uncertainty/freshness for the first, suppression
   for the second, no student ranking/raw answers/re-identification.
7. Parent digest preview/send/cadence/language/source period/content exclusions/opt-out/history/failure retry;
   another parent denied.
8. Institution dashboard effective config, scheduled versions, disclosures, permissions, confirmation, audits.
9. Teacher and parent reviewers assess clarity, usefulness, privacy and actionability, not rendering alone.
10. Super Admin policy/job/disclosure/suppression/delivery metrics and new AI-function routing attempts reconcile.
11. Cross-role/tenant/campus/class privacy, audits, consent withdrawal, deletion/export in disposable fixtures.
12. All role surfaces mobile/desktop, keyboard, readers, zoom, reduced motion, slow network, stale config and
    job failure.

The technical ledger records available policy/effective-snapshot/disclosure/session/job IDs and screenshot
hashes. The final acceptance package must still add the missing assignment-match, visibility-access,
escalation/consent/delivery, cohort-threshold, digest/delivery, audit, route-attempt, cross-tenant, physical
device, assistive-technology, and reviewer evidence for every row.

## Combined acceptance decision

Produce one signed matrix with a pass/fail/blocked cell for every row. A stage becomes eligible for completion
only when its own automated evidence and all its human/device/dashboard rows pass. Production readiness remains
false until all required stage gates, real device checks, cross-role/tenant security checks, route restoration,
and human satisfaction evidence are reviewed and approved. An open Stage 9 physical-device gate or Stage 10
repeat-use gate keeps Stage 11, Stage 12, and the combined release claim open even if their technical
automation passes. As of 2026-08-14 every stage remains open.
