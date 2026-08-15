# Execution prompt 13 of 13 — Stage 13: safe learning with people around you

Use this prompt only after the institutional loop, disclosures, permissions, and privacy controls are
complete. This is the final specified stage.

## Mission

Reduce student isolation without creating comparison anxiety or social-media dynamics. Implement
three deliberately constrained features: anonymous “you’re not alone” signals, timer-based study
rooms with no chat, and small opt-in squads matched by exam and level. Never build public feeds,
followers, popularity metrics, global leaderboards, open messaging, or purchasable social/streak repair.

The safest minimal implementation that proves beneficial co-presence is preferred over feature breadth.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 7, 9–12 and
   Stage 13.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect identity/age/consent, institution policy, safeguarding,
   moderation, notifications, presence/realtime infrastructure, exams, learner model, and privacy.
3. Manually verify Stage 12 across student, institution, teacher, parent, and Super Admin roles.
4. Inspect applicable child-safety/legal requirements and existing product policy. If a required
   legal/safeguarding decision is absent and cannot be safely inferred, stop that subfeature and
   report the blocker rather than invent policy.
5. Preserve worktree changes. Do not expose learner-model details or identifiable struggle data to peers.

## Non-negotiable product and safety constraints

- Opt-in participation with clear exit and no penalty.
- Minimum cohort/privacy thresholds before any anonymous aggregate appears.
- No exact identity, individual mastery, marks, confidence, errors, raw questions, institution-private
  content, or activity timestamps disclosed to peers.
- No peer-to-peer chat, DMs, comments, reactions, follower/friend mechanics, feeds, public profiles,
  popularity counts, leaderboards, or rank.
- No cross-age/institution matching unless explicit approved policy permits it; default deny.
- No public room discovery that exposes schedules or identity.
- No engagement pressure, guilt, fake scarcity, or noisy campaigns.
- Accessible blocking/reporting/leave controls where another participant can affect the experience.
- Clear retention, consent, audit, moderation, incident, and emergency behavior.

## Feature 1: anonymous “you’re not alone” signals

- Show a coarse, delayed, thresholded statement such as other students are also working through this
  concept—never exact names, marks, questions, times, or small counts.
- Derive only from eligible recent aggregate learning activity under institution/privacy policy.
- Use minimum cohort size, time bucketing, count/noise/coarsening rules, and suppression against
  differencing/re-identification.
- Avoid turning struggle into comparison. Copy should normalize effort, not claim popularity.
- Allow institutions/students to disable it and explain what the signal means.
- Do not generate individualized social nudges or repeated notifications.

## Feature 2: study rooms with timer and no chat

- A room is bounded co-presence around a declared study goal/exam/topic and a finite timer.
- Show only privacy-safe presence, shared timer, individual local goal/progress, pause/leave, and
  completion reflection.
- No text/audio/video/chat/reactions or arbitrary user-generated public content.
- Support invited/institution-scoped or safely matched rooms according to policy.
- Define room creation/join capacity, lobby, start, reconnect, late join, host loss, end, abandonment,
  and cleanup state machine.
- Realtime authorization must be revalidated server-side; presence tokens expire and cannot join
  another tenant/room.
- Leaving must be immediate and penalty-free. No streak loss or public noncompletion.
- Provide an individual timer fallback if no safe room is available.

## Feature 3: small squads matched by exam and level

- Opt-in, purpose-bounded, small groups matched on compatible exam/curriculum/topic and a coarse
  learning band—not raw marks, hidden ability, sensitive traits, or exact learner-model data.
- Prefer institution/age-safe boundaries and explicit policy.
- Explain matching factors in plain language and allow decline/rematch/leave without penalty.
- A squad is a lightweight shared study plan/co-presence mechanism, not a social network.
- Define membership duration, max size, inactivity/expiry, blocked relationships, duplicate accounts,
  exam changes, institution transfer, and no-match fallback.
- Do not expose ranking, comparative progress, or who is “best/worst.”
- If any collaborative contribution is allowed beyond presence, keep it structured, nonfreeform,
  moderated, and separately approved; default to no peer content.

## Matching/privacy architecture

- Use deterministic policy/eligibility filters before any model. AI is not needed to match basic
  structured exam/level fields.
- If AI is used for safe grouping explanations or moderation, register independent functions,
  structured validation, gateway routing, budgets, and audit; never send unnecessary identities.
- Store only minimal matching features and reason codes. Keep raw mastery private.
- Prevent membership enumeration, timing attacks, small-cohort inference, and cross-tenant leakage.
- Define consent/guardian/institution requirements by age/context and fail closed when unresolved.
- Support block/report/incident workflow even without chat, plus staff response and audit.

## Backend/realtime/API requirements

- Entities/state for aggregate-signal eligibility, room/session/presence/timer, squad/membership/match
  reason, consent/policy, block/report/incident, and cleanup.
- Strong RBAC/ABAC, tenant/age/exam scoping, expiring realtime tokens, rate limits, idempotency,
  concurrency controls, and abuse prevention.
- Server-authoritative timer and room membership; reconnect without duplicate presence.
- Scheduled cleanup/expiry and resilience to process/realtime-provider restart.
- Privacy-preserving aggregate jobs with threshold/suppression tests.
- Notifications only for explicit room/squad actions and within configured quiet/cadence rules.
- Export/deletion/transfer/consent withdrawal and audit integration.
- Operational metrics must not create student popularity or performance rankings.

## Frontend requirements

- Contextual opt-in doors near exams/topics/review—not a public social tab/feed.
- Plain-language privacy, matching, and institution-rule disclosure before join.
- Anonymous signal is subtle and dismissible.
- Study room shows finite goal/timer/co-presence, obvious leave, reconnect state, and individual fallback.
- Squad shows purpose, coarse match reasons, finite membership, leave/rematch, and no comparative stats.
- Safe empty/no-match/suppressed/offline/reconnect/room-ended/policy-changed states.
- Mobile/desktop, keyboard, screen reader, color-independent presence, reduced motion, timezone, and
  slow/realtime-loss resilience.

## Dashboard and safeguarding requirements

Create role-appropriate operational/safety dashboards:

- aggregate eligibility/suppression and privacy-threshold health;
- rooms created/started/completed/abandoned, reconnect failures, timer drift, capacity, cleanup;
- squad match/no-match/rematch/leave/expiry with coarse reason codes;
- consent/policy eligibility failures;
- block/report/incidents and staff resolution workflow;
- cross-tenant/realtime authorization denials and abuse/rate-limit events;
- opt-in/leave and qualitative isolation/anxiety feedback—not rankings or addictive engagement;
- any AI moderation/explanation cost/latency/validation/fallback in Petros AI Routing;
- no broad raw learner data or peer identity exposure.

Institution dashboards should see only their authorized aggregate/safety scope. Super Admin sees
platform health and audited incident access. Students/parents see their own participation/preferences
as policy allows.

## Automated verification required

Test at least:

- aggregate minimum threshold, delay/coarsening/suppression, differencing resistance, disablement;
- room state machine, capacity, server timer, reconnect, duplicate presence, host loss, leave, expiry,
  cleanup, restart recovery, and individual fallback;
- no chat/DM/reaction/feed/follower/ranking APIs or UI are introduced;
- squad eligibility, coarse matching, institution/age boundaries, explainable reason codes, no-match,
  rematch, leave, expiry, exam change, transfer, and block rules;
- raw marks/mastery/errors cannot be inferred or returned;
- realtime token expiry, room/tenant authorization, enumeration/rate-limit abuse;
- consent/policy changes and fail-closed behavior;
- incident/report workflow, permissions, audit, retention/export/deletion;
- accessibility/responsive and realtime-loss states;
- load/concurrency tests for presence/timer/matching;
- Stage 5/safety evaluation for copy that avoids comparison anxiety and pressure.

Run unit/integration/E2E, security/authorization, realtime/load, typecheck, lint, builds, and quality/
safety checks. Report exact commands/results and any untested external realtime behavior.

## Mandatory manual QA and dashboard acceptance

Use multiple disposable student accounts, at least two institutions/age groups, institution staff,
parent where applicable, and Super Admin:

1. **Anonymous threshold:** Test below, at, and above the cohort threshold. Confirm suppression,
   coarse/delayed copy, opt-out, no exact counts/identity, and resistance to repeated-query inference.
2. **Study room lifecycle:** Create/join/start/reconnect/late-join/leave/end a room with multiple real
   browser sessions. Confirm server timer agreement, no duplicate presence, immediate penalty-free
   leave, cleanup, and no chat/reaction affordance or endpoint.
3. **Failure/realtime:** Kill/restart/reconnect the local realtime service or simulate network loss,
   host close, full room, expired token, and policy change. Confirm recovery or individual fallback.
4. **Squad matching:** Use compatible, incompatible, cross-institution, cross-age, blocked, no-match,
   exam-changed, and transfer fixtures. Confirm only permitted matches, coarse explanation, rematch/
   leave/expiry, and no raw score/mastery exposure.
5. **Comparison-anxiety review:** Have students/safeguarding reviewers inspect copy and flows. Ask
   whether anything feels ranked, pressuring, popularity-driven, or exposing. Record findings and fix
   substantive concerns; technical completion alone is insufficient.
6. **No-social-network audit:** Manually inspect routes, navigation, network API, and schemas for any
   feed, follower, public profile, leaderboard, comment, chat, DM, or reaction capability. Any such
   addition fails the stage.
7. **Incident path:** Exercise block/report/incident with authorized staff resolution, audit, and
   restricted visibility. Confirm malicious/unauthorized users cannot inspect reports.
8. **Student/parent/institution disclosure:** Verify opt-in, matching factors, visibility, retention,
   and leave/withdrawal language across roles.
9. **Operations dashboard:** Reconcile aggregate suppression, room lifecycle/timer/reconnect/cleanup,
   squad match/no-match/leave, consent failures, auth denials, and incident events with fixture IDs.
10. **AI Routing dashboard:** If any AI function exists, reconcile its cost/latency/validation/retry/
    fallback and prove unnecessary identity data was not sent.
11. **Security/privacy:** Attempt enumeration, forged realtime tokens, cross-room/tenant join, rapid
    queries, and raw field access. Confirm safe denial/rate limiting/audit.
12. **Accessibility/responsiveness/load:** Multiple mobile/desktop sessions, keyboard/screen reader,
    zoom, color independence, reduced motion, timezone, slow network, and the documented load target.

For every check, name accounts/roles, navigation, setup, actions, expected frontend, expected
backend/realtime/dashboard/audit evidence, failure criteria, human satisfaction/safeguarding questions,
and screenshots/session/incident IDs to capture.

## Definition of done

Stage 13 is complete only when safe co-presence measurably reduces isolation in human review without
creating comparison anxiety; anonymity thresholds resist re-identification; rooms and squads are
bounded, opt-in, resilient, and policy-compliant; no social-network mechanics exist; and all frontend,
backend, realtime, privacy, safeguarding, and dashboard checks have evidence.

## Final response contract

Return scope, privacy/realtime/matching design, migrations/jobs/env, clickable files, exact automated/
security/load/quality results, multi-user browser and human safeguarding checks, detailed role-based
dashboard QA, evidence, remaining risks, and `Stage 13 complete` or `Stage 13 not complete`.

