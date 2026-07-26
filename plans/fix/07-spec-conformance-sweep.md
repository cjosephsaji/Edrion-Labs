# Plan 07 — Spec-conformance sweep: audit → fix → verify, then final QA

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: Plans 01–06 ALL complete. GATE-IN: `GET /v1/health/ai` shows real models; the
> Plan 02 route table is all non-404; a guided session streams blocks progressively. If any fail, stop.
>
> This plan is an AUDIT loop, not a build plan. For each checklist item: (1) VERIFY current
> behavior in the running app/code, (2) if it already conforms, mark PASS and move on — this
> frontend is near-complete, many items will already pass, (3) if not, make the smallest fix that
> satisfies the quoted spec text, (4) re-verify. Fill the report table as you go. If a fix would
> be large (new feature, not polish), mark DEFER with a one-line scope note instead of building it.

## 1. Objective

Sweep every student-portal surface against the product spec's cross-cutting invariants — empty
states, trust/transparency furniture, tone rules, accessibility — and finish with a full
regression gate. Done = the report table below is filled with PASS / FIXED / DEFER for every row,
and the regression gate is green.

## 2. How to audit

- Run both apps (README §3). Use the dev student (`student@greenwood.edu`) for institutional
  persona checks; use the persona switcher (sidebar footer) or a seeded independent learner for
  independent-persona checks.
- To simulate empty states, prefer a student/persona with no data over deleting data. Never
  destroy seeded data.
- Copy quoted below is normative: match its meaning and tone exactly; wording may be adapted to
  existing microcopy conventions in `plans/00-overview.md` §2.3 if they conflict.

## 3. The checklist (spec text is the requirement; likely files given as starting points)

### A. Trust & transparency

| # | Requirement (from spec) | Where to check |
|---|---|---|
| A1 | Every analytics stat slot carries a mandatory "FROM —" source line; **no mastery percentage anywhere in the app** (grep the whole frontend for mastery/percent-styled scores) | `(app)/progress/page.tsx`, `components/institutional/*` |
| A2 | Strength/Growth evidence tags are tap-to-expand and reveal their evidence ("based on 4 practice sessions this month"); insights list the literal events behind them | progress page |
| A3 | "Shared with your school/college" panel: plain ✓/✕ rows — counts and evidence tags go up; chats, scratchpad, hint usage, and uploads never do. **Independent learners never see this panel** (not rendered, not greyed) | progress and/or settings Privacy section |
| A4 | Settings → Privacy for independents says "nothing is shared with anyone"; Institution section appears only for institutional students and is read-only | `(app)/settings/page.tsx` |
| A5 | Every AI-generated artifact/visual/block carries the violet AI-accent cue and a "made from: [source]" / "FROM —" line | Library artifacts, Lab visuals, session note cards |
| A6 | Mock exam results state explicitly that mock marks are private rehearsal data, never shared with the institution | `lab/mock-exams/[id]/results` |
| A7 | Assignments/homework detail shows the governance pill (Full / Concept-only / Off) stating how Petros may help; policy is read-only and enforced server-side (verify the API refuses, not just the UI hiding a button) | `(app)/assignments/[id]`, `(app)/homework/[id]`, backend `homework-policy.service.ts` |

### B. Safety-net interactions

| # | Requirement | Where to check |
|---|---|---|
| B1 | Session exit control is labeled by what it does ("Save and pause session", never bare "Exit"); leaving confirms "your progress is saved" and a Resume card appears on Learn Home | session header, `(app)/learn/page.tsx` |
| B2 | Resume card renders ONLY when an unfinished session exists; no "nothing to resume" placeholder when none does | Learn home |
| B3 | Reopened completed sessions/history entries show an explicit read-only banner; paused sessions resume live | `(app)/history/page.tsx` + session page read-only mode |
| B4 | Checkpoint wrong answers get diagnostic feedback (names the error, invites retry), never a bare red X; student stays to retry; session advances only on evidence | `components/learn/blocks/Checkpoint.tsx` |
| B5 | Quick Answer NEVER auto-escalates into a lesson; follow-up hooks are opt-in and ignorable | `(app)/learn/quick/[id]/page.tsx` |
| B6 | Late assignment state is calm amber, never alarming red | assignments/homework list + detail |
| B7 | Empty states everywhere are inviting propositions ("Nothing due today — want to get ahead or revisit something?"), never blank regions or bare "no data" (sweep: home, plan timeline, revision, library, history, calendar, achievements, assignments) | all list surfaces; `components/ui/empty-state.tsx` exists — use it |

### C. Persona & adaptation

| # | Requirement | Where to check |
|---|---|---|
| C1 | Independent learners: the institutional nav group (Homework/Classes/Analytics…) is NOT in the DOM — not disabled, not hidden with CSS | sidebar nav component |
| C2 | Terminology swaps by stage: Homework/Classes/Marks (school) vs Assignments/Courses/Grades (college); "Study from my notes" intent chip appears only for college | `src/lib/persona.tsx` consumers |
| C3 | Completion celebrations scale by persona: warm burst (school) vs clean check + forward motion (college); celebration style setting (Warm/Calm) is respected | session completion overlay, settings |
| C4 | Persona switcher updates avatar/name/stage instantly and re-skins nav/copy with layout untouched | sidebar footer |

### D. Comfort & accessibility

| # | Requirement | Where to check |
|---|---|---|
| D1 | Reduce-motion (settings toggle AND `prefers-reduced-motion`) suppresses settle/spring/celebration animations app-wide; `data-reduced-motion` is already set on `<html>` by `src/lib/theme.tsx` — verify CSS/animation code actually honors it | tokens.css consumers, animated components |
| D2 | Theme cards (Ivory/Dim/Ink) apply instantly, persist, and "match system" follows the OS; text-size setting takes effect | settings, `src/lib/theme.tsx` |
| D3 | Hint-directness setting changes where rung 1 starts in the next practice session; weekly-goal slider re-labels the Home ring | settings → practice, home |
| D4 | Notification options contain no guilt-based types at all | settings |
| D5 | Touch targets in Lab sims/diagrams are big, nothing hover-only, nothing animates before interaction when reduced-motion is on | lab pages |

### E. Feedback-in-the-moment details

| # | Requirement | Where to check |
|---|---|---|
| E1 | Generation stall shows a quiet "Petros is thinking…" shimmer on the pending block, never a full-screen spinner over already-streamed content | session canvas, `StreamingIndicator.tsx` |
| E2 | Ask drawer shows "Asking about: [current block]"; on mobile viewport it covers ≤ ~60% height and dismisses on swipe-down/overlay tap | `AskPetrosDrawer.tsx` |
| E3 | Spine nodes: done/current/upcoming states; upcoming is pale-quiet, NOT padlocked; completed nodes scroll back on tap; nodes cannot be self-marked | `SpineRail.tsx` |
| E4 | Calendar filter chips persist their on/off choice across reloads; day tap opens a popover; exam events offer "Build a prep plan" | `(app)/calendar/page.tsx` |
| E5 | Achievements: in-progress badges show a literal progress line ("9 of 14 days"), never a score; tap reveals exactly what earned it; no badge exists for logins/spending | `(app)/achievements/page.tsx` |
| E6 | Library ingestion shows live per-file progress ("Reading page 3 of 12…"), and low-confidence OCR pages surface a "confirm what we read" step | library upload flow — if the OCR-confirm step doesn't exist, this is a DEFER candidate (scope note, don't build) |

## 4. Report format (fill as you go; this is the deliverable)

```
| Item | Verdict (PASS / FIXED / DEFER) | Evidence or fix (file + one line) |
```

Every row A1–E6 must appear. For FIXED: name the file(s) changed. For DEFER: one-line scope
estimate of what a real implementation needs.

## 5. Final regression gate (after the table is complete)

1. `corepack pnpm@9.15.9 --filter @edrion/api typecheck` → 0
2. `corepack pnpm@9.15.9 --filter @edrion/student-web typecheck` → 0
3. `corepack pnpm@9.15.9 --filter @edrion/api test` → green
4. `corepack pnpm@9.15.9 --filter @edrion/student-web build` → succeeds
5. Click-through script (institutional persona): login → home → intent "teach me photosynthesis"
   → session streams → answer a checkpoint → open drawer, ask, pin → save-and-pause → resume card
   on home → resume → finish session → artifact lands in Library → quick answer → practice with an
   on-demand hint → generate a Lab diagram → mock exam create → open homework + governance pill →
   progress page (FROM— lines) → calendar → achievements → settings theme swap → history reopen
   (read-only banner). Every step: no console errors, no error boundaries.
6. Repeat a 5-screen spot-check as the independent persona: no institutional nav in DOM, no
   shared-data panel, "nothing is shared with anyone" in privacy.

## 6. Out of scope / guardrails

- No new features beyond the smallest conforming fix; big gaps → DEFER with scope note.
- No visual redesigns; use existing tokens/components (`empty-state.tsx`, pill buttons, toast).
- Never weaken a server-side rule to make a UI check pass (governance, privacy, sharing).
- Do not touch other apps or migrations.

## 7. Escalation — stop and report if

- A checklist row contradicts what the running app fundamentally is (e.g. the transparency panel
  would require data the backend never exposes) — DEFER it with the contract gap named.
- The regression click-through fails at a step owned by an earlier plan — report which plan's
  gate regressed rather than patching around it.
