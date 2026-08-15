# Execution prompt 12 of 13 — Stage 12: institutional boundaries and human loop

Use this prompt after student reflection surfaces are trustworthy. Implement the institution-facing
configuration and human handoff loop. Do not begin Stage 13 social/co-study features.

## Mission

Let institutions define Petros’s legitimate boundaries while making every active boundary visible to
students. Implement syllabus bounds, active-homework behavior, session-visibility settings and
disclosure, teacher escalation summaries, class-level struggle signals, and parent digests. Petros
must escalate to people when it cannot unstick a student rather than pretending to replace them.

Institution controls must never expose provider choices to students, weaken student privacy silently,
or turn Petros into surveillance, grading automation, or homework-answer enforcement.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 7–10 and Stage 12.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect institution/campus roles, syllabus, assignments/homework,
   teacher portal, parent portal, messaging/notifications, audit, consent, and support access.
3. Verify Stage 11 recommendations and alarms manually.
4. Map existing permission and tenancy architecture before adding configuration.
5. Preserve worktree changes. Treat child/student learning data as highly sensitive.

## Policy model and resolution

Create a versioned policy model with explicit precedence (platform safety → institution → campus/
programme/grade/subject where permitted → session context → student accessibility/language choice).
Include effective dates, draft/published state, author, reason, version, audit, rollback, and preview.

Resolve policy server-side for every session and expose a student-safe disclosure snapshot. A running
session must have stable policy semantics; define what happens if policy changes mid-session.

## Syllabus bounds

- Configure approved curriculum/syllabus sources, grades, subjects, topics, depth, and external-source
  allowances.
- PLAN and document grounding must stay within resolved bounds or state clearly when a requested topic
  lies outside them and offer the legitimate fastest allowed path.
- Never refuse into a vacuum.
- Log policy decisions and source boundaries without exposing internal secrets.
- Provide preview/test tools before publish and safe rollback.

## Active homework/assignment behavior

- Detect related active assignment windows from authoritative assignment/deadline data.
- During the window, Petros shifts toward questioning, hints, setup, prerequisite repair, critique,
  and process feedback rather than supplying a final answer.
- It changes teaching shape rather than issuing a blank refusal.
- Define relationship matching, grace/timezone, teacher override, submitted/late/extended status, and
  false-match correction.
- Display the rule in plain language to the student.

## Session visibility and disclosure

- Institutions can configure what session metadata/content categories teachers or parents may see,
  within platform privacy/safety limits.
- Students must see exactly what is visible, to whom, for how long, and why before or during the
  session.
- Default to minimum necessary access. Do not silently expose raw transcripts, private notes,
  voice/images, or unsaved artifact drafts.
- Every privileged access is permissioned, purpose-limited, and audited.
- Policy cannot override legal deletion/export/consent requirements or student ownership.

## Teacher escalation summary

When the struggle ladder and repair options genuinely cannot unstick the student:

- offer, do not force, a teacher handoff;
- show the student the proposed summary and allow edit/consent where policy permits;
- summarize concept, goal, what was tried, observed break point, evidence, and useful teacher next step;
- exclude provider/model details, hidden chain-of-thought, irrelevant personal history, and unsaved
  private artifacts;
- route to the correct teacher/class/subject workflow with delivery/read/status tracking;
- support withdrawal/cancellation before delivery where feasible;
- register teacher-escalation summary generation as a validated/routed AI Function.

## Class-level struggle signals

- Aggregate concept/error/struggle signals for authorized teachers with minimum cohort thresholds and
  privacy protections.
- Show evidence coverage, uncertainty, freshness, and affected curriculum area.
- Avoid ranking students, exposing raw answers, or labeling a class as weak.
- Provide actionable instructional next steps and drill-down only where role/policy permits.
- Suppress small cohorts and potential re-identification.

## Parent digest

- Produce a bounded, configurable digest at an appropriate cadence from permitted evidence.
- Focus on work completed, concepts being built, useful support, upcoming review, and effort/strategy.
- Do not expose raw session content, private questions, calibration judgments, teacher-only notes,
  or ability labels unless an explicit lawful policy allows it.
- Show source period, uncertainty, translation/language, delivery preference, opt-out, failure/retry,
  and preview.
- Generate via a registered, validated AI Function; never hardcode the provider.

## Backend/security/API requirements

- Policy/config/version tables, resolution service, preview/publish/rollback, effective snapshot on
  sessions, and audit.
- Strong RBAC/ABAC and tenant/campus/class/subject scoping for institution, teacher, parent, student,
  and Super Admin roles.
- Homework matching, escalation workflow, cohort aggregation/privacy threshold, digest generation and
  delivery jobs with idempotency/retry/cancellation.
- Consent/disclosure records, access logs, export/deletion/retention and legal-hold integration where
  the platform already supports it.
- Safe rate/cost limits, content validation, prompt/schema versions, provider-neutral errors.
- No direct frontend provider calls or keys.

## Frontend/dashboard requirements

### Institution policy dashboard

- Draft/edit/preview/test/publish/rollback syllabus, homework, visibility, escalation, and digest policy.
- Effective-policy preview by campus/grade/subject/student fixture.
- Plain-language student disclosure preview.
- Permission, confirmation, version diff, scheduled activation, and audit history.

### Student portal

- Visible current policy disclosure in sessions and contextual homework behavior explanation.
- Teacher handoff offer with preview/edit/consent/status.
- No provider names, opaque refusal, surveillance tone, or hidden visibility change.

### Teacher dashboard

- Escalation inbox/status and class-level struggle signals with cohort/privacy thresholds, evidence,
  freshness, uncertainty, and actionable response.

### Parent portal

- Digest preview/history/preferences/opt-out and clear source period/privacy language.

### Super Admin/operations

- Cross-institution policy health, job failures, disclosure/version drift, small-cohort suppression,
  delivery failures, cost/latency/validation/fallback by function—without broad raw student content.

## Automated verification required

Test at least:

- policy precedence, effective dates, versioning, preview/publish/rollback, mid-session snapshot;
- syllabus in/out-of-bound behavior and nonempty legitimate fallback;
- active homework relation/status/timezone and question-vs-solution behavior;
- disclosure exactly matches enforced visibility;
- raw/private/unsaved/voice/image content is excluded by default;
- handoff offer/preview/edit/consent/delivery/status/cancel and correct teacher routing;
- class aggregation thresholds, uncertainty, suppression, and no re-identification/ranking;
- parent digest permissions, exclusions, cadence, opt-out, translation, delivery retry;
- role/tenant/campus/class/subject isolation and privileged-access audits;
- structured AI validation/routing/budgets/fallback/provider neutrality;
- quality harness cases for active homework, escalation, digest tone, and institution boundaries;
- accessible/responsive disclosures and role dashboards.

Run tests, typechecks, lint, builds, E2E, security/authorization checks, migration validation, and
quality subsets. Report exact commands/results.

## Mandatory manual QA and dashboard acceptance

Use separate institution-admin, teacher, parent, student, and Super Admin fixtures:

1. **Policy lifecycle:** Draft a policy, preview effective values/disclosures, publish with future/current
   activation, verify session snapshot, diff/audit, rollback, and no cross-institution effect.
2. **Syllabus boundary:** Ask an in-bound, deeper-than-allowed, and out-of-bound question. Confirm
   useful allowed teaching or legitimate next path, not empty refusal/hallucinated syllabus.
3. **Active homework:** Before/during/after the window, ask a related question. Confirm the teaching
   shape changes toward questioning/hints only during the valid window and disclosure explains it.
   Test submitted, extended, late, and unrelated cases.
4. **Visibility:** Compare the student disclosure with exactly what teacher/parent accounts can see.
   Test policy change mid-session and underprivileged access. Any mismatch fails the stage.
5. **Teacher handoff:** Deliberately exhaust the struggle path, inspect/edit/consent to the summary,
   deliver it, verify correct teacher inbox/status, and confirm excluded/private data stays excluded.
6. **Class signals:** Seed a large-enough cohort and a below-threshold cohort. Verify useful aggregate
   signal for the first, suppression for the second, no rankings/raw answers, and correct evidence.
7. **Parent digest:** Preview/send a digest, verify cadence/language/content exclusions/source period,
   opt-out, history, failed delivery retry, and another parent cannot access it.
8. **Institution dashboard:** Inspect effective config, scheduled versions, disclosure preview, audits,
   and permission/confirmation behavior.
9. **Teacher/parent dashboards:** Have actual role-appropriate reviewers assess clarity, usefulness,
   privacy, and actionability—not only rendering.
10. **Super Admin operations:** Reconcile policy/job/disclosure/suppression/delivery metrics and Petros
    AI Routing function costs, latency, validation, retry, and fallback with fixture correlation IDs.
11. **Security/privacy:** Attempt cross-role/tenant/campus/class access, inspect audits, exercise consent
    withdrawal/deletion/export in disposable fixtures.
12. **Accessibility/responsiveness:** All role surfaces at mobile/desktop, keyboard, screen reader,
    zoom, reduced motion, slow network, stale config, and job-error states.

Every manual check must name account/role, navigation, fixture, actions, expected UI, expected
backend/dashboard/audit evidence, failure criteria, reviewer satisfaction questions, and evidence.

## Definition of done

Stage 12 is complete only when an institution can safely configure Petros boundaries, enforcement and
student disclosure match exactly, active homework changes teaching rather than refusing, human
handoffs work, aggregate/parent views protect privacy, and role-based manual testing confirms clarity
and usefulness across all dashboards.

## Final response contract

Return scope, policy/security/workflow design, migrations/jobs/env, clickable files, exact automated/
quality/security results, cross-role browser/human checks, comprehensive dashboard QA/evidence,
limitations, Stage 13 prerequisites, and `Stage 12 complete` or `Stage 12 not complete`.

