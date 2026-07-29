# 04 — Petros Learn Pedagogy Orchestrator — HYPERSPEC 2/3: SESSION UI & ENTRY POINTS

> Companion to `04-PETROS-LEARN-DYNAMIC-TEACHING.md` §4–§5, §7. Where this conflicts with the original, **this wins.** Depends on file 1/3 (block schema, state machine, API). Scope: the session document screen tap-by-tap, block interactions, composer, artifact rail, entry points (learning path, Library "teach me this", free-chat handoff, individual-tier doors), exit/save, "Why this?", latency, offline, notifications.

## Constraints applied (from the codebase audit)
- Path entry reads/writes `learning_path_items.status` (existing) — completing a session marks the item exactly as the legacy fixed-sequence flow did.
- "Save to notes" / "Make flashcard" / artifact commit write to the **existing** notes + flashcard tables (Chat 8 services); canvas embeds live in `visual_canvases`. No Learn-owned copies.
- The session-record "Save to Library" produces a normal Library material via the existing ingestion path.
- Governance disclosure slot (footer) is driven by the `policy_snapshot` from `resolve-policy` (student-tutor scope); empty in P1.

---

## §1. Session document screen — what the user sees

**Route:** `apps/student-web` `/learn/session/:id`. Mobile-first; ivory background; 4px grid.

**On open (new session):**
1. Top bar renders immediately from the POST response: back chevron (= exit flow §7), topic title (truncate middle at 28 chars), time chip ("15 min" — the budget, counts down from the halfway point only; before that it shows the static budget, because a ticking clock from second one is anxiety theatrics), overflow menu (⋯).
2. Directly under the top bar: the **segmented progress bar** — `checkpoints_total` equal segments, 4px tall, track `#e8e4d8`, fill primary green `#1f604a`, 200ms fill animation (reduced-motion: instant). A remediation detour visibly **adds** a segment (bar re-segments with a subtle 150ms width reflow). Never shrinks.
3. Body: the block column, max-width 640px desktop, full-width mobile with 16px gutters. First block appears as a **skeleton card** carrying the move's icon (each move key has a fixed lucide icon mapped in `packages/ui`) within 300ms of navigation; first content token streams in < 1.5s (§8).
4. Bottom: the **persistent composer** — single-line input, placeholder "Ask anything…", send button (primary green, disabled while empty). It never disappears, including while `awaiting_response`.
5. Desktop right rail / mobile grabber at bottom-right above the composer: **artifact rail** (§4).

**Empty state:** none — a session never opens empty; the skeleton is the loading state. **Error state (stream fails to start after 8s):** the skeleton is replaced by a calm card "Couldn't start your lesson — check your connection" with **Retry** (primary) and **Back** (ghost). Retry re-hits the stream URL; the session row already exists, so retry never double-creates.

## §2. Block-by-block interaction (binding)

- **Explanation:** card with `title` (optional, 15px semibold) + `body_md`. If `deeper_md` exists: a ghost "Go deeper" link-button at card bottom; tap expands in place (height animation 200ms, reduced-motion instant), label flips to "Show less". No LLM call on expand.
- **Worked example:** problem statement card; steps as a stepper — step 1 visible, subsequent steps collapsed behind a full-width secondary button. When the next hidden step has a `predict_prompt`, the button area shows the prompt + a one-line input + two buttons: **Check my thinking** (submits prediction, then reveals) and ghost **Just show the step**. Prediction is stored, echoed back italicized above the revealed step ("You said: …"), never graded in P1. All steps revealed → the block is complete.
- **Question set:** one question at a time within the card (1/3 indicator). MCQ: option rows, tap selects, **Submit** confirms (two-step — no accidental answers). After submit the question **locks**: selected row tinted green (correct) or amber (wrong — never red; a wrong answer is not a bad state), correct answer outlined green, and a "Why?" ghost expander revealing `why_md`. Short/numeric: input + Submit; while grading, a 3-dot inline loader ≤ 3s; `correct=null` renders "Recorded — couldn't auto-check this one" in neutral gray. Next question slides in on lock (150ms).
- **Prereq pulse:** same component with a small "Quick check — before we start" caption. If both wrong, the immediately following remediation explanation opens with fixed copy: "Let's shore this up first — it'll make the rest click." (terminology-pack override key `learn.remediation_lead`).
- **Canvas embed:** live mini-canvas, 240px tall mobile / 320px desktop, pan/zoom enabled, node-tap opens edit per existing canvas behavior; top-right expand icon → full canvas screen (existing route) scrolled to the fragment; back returns to the session at the same scroll position. Skeleton while the pipeline runs shows the fixed copy "Drawing this out…". Degraded fallback (pipeline hard-fail) renders as a normal explanation block — the student never sees a broken diagram.
- **Socratic probe:** the probe question card with a visible ghost button **"Just explain it"** bottom-right. Answer via the card's own input (not the composer). After max turns or escape, the explanation block streams in directly beneath.
- **Synthesis:** prompt card + one-line input ("Say it in one sentence…") + **Submit** + ghost **Skip**. On submit, the tightened version renders beneath with the label "Tightened:" and the delta note in muted text.
- **Artifact commit:** proposed cards as a vertical checklist — each row: checkbox (default on), front text, tap-to-expand back, inline edit pencil, swipe-left to discard (desktop: hover ✕). Optional row "Include your diagram" when `include_canvas`. Footer: **Save N to Library** (primary; N live-updates) + ghost **Skip**. On save: button spinner ≤ 1s → row of ✓s → card collapses to a summary line "✓ 4 cards saved to Library" and the artifact rail count bumps.
- **System notice:** full-width tinted card — break = ivory with green accent; budget = amber accent; degraded/policy = neutral gray. Its `actions` render as buttons per file 1 §4.1.
- **Every block's overflow (⋯, top-right of card):** exactly four verbs — **Save to notes** (creates a Note in the existing notes tables via Chat 8's notes service, source-linked to `{session_id, block_id}`; toast "Saved to Notes"), **Make flashcard from this** (opens a pre-filled 2-field card sheet, Save → existing flashcard tables via Chat 8's card service, entering FSRS), **Explain simpler**, **Explain deeper** (each sends a fixed instruction into the planner as a `pending_free_question` equivalent; the next block is a re-explanation at the requested level and does **not** advance a checkpoint). No fifth verb.

## §3. Streaming behavior

Blocks stream token-progressively into the markdown renderer; interactive affordances (options, buttons, steppers) mount only after the block's Zod parse completes on stream end — the student can read while the block finishes but can't interact with a half-block. Auto-scroll follows the streaming block only if the student is already at the bottom (within 80px); if they've scrolled up, a floating "↓ New" pill appears instead — never yank scroll. Reduced-motion: blocks appear settled, no entrance animation.

## §4. Composer & artifact rail

- **Composer send:** appends the student's question as a right-aligned quiet chip in the column (their words stay visible in the lesson), then the planner detours. If sent while `awaiting_response`, a small note under the chip: "I'll get to this right after this question." — the current block still must be completed or skipped first (binding: free questions never bypass a locked interaction).
- **Artifact rail:** desktop right rail (240px) / mobile swipe-up sheet triggered by a floating counter chip ("3 ✦"). Contents: live list of session artifacts — flashcards (front text, tap to edit via the same card sheet), canvas fragments (thumbnail, tap opens embed), saved notes/snippets. Empty state: "What you make here shows up here." Counter increments with a 150ms pop (reduced-motion: none).

## §5. Entry points (P1 set — binding)

1. **Learning path** (existing screen): the topic node's CTA changes from "Start" to **"Start lesson"** when `learn.orchestrator` flag resolves on. Tap → `POST /learn/sessions {entry: 'learning_path', entry_ref:{learning_path_id, learning_path_item_id}}` with default budget 15 min, `goal='acquisition'`. Completing the session (`closed`, `end_reason IN ('goal_met','time_budget','student_exit')` with ≥ 1 checkpoint done) sets the corresponding `learning_path_items.status` to complete exactly as the legacy flow did — the path progress contract is unchanged, and `optional_branch` items behave identically.
2. **Library "Teach me this"** (05 §3): in the document workspace's study rail, the existing "Teach me this" action → budget sheet ("How long do you have?" chips: 10 / 15 / 25 min, default 15) → session with `topic_key='material:<id>'`, `goal='acquisition'`. Render calls ground in the doc index and cite pages as "(p. 7)" plain text (file 1 §4.3). Session close returns to the workspace with a toast "Lesson saved" if saved.
3. **Free-chat handoff** (§7 of the original): in the Petros assistant sheet, when the assistant's reply concerns a learnable topic and exceeds a quick answer, the assistant appends a handoff card: "Want to actually learn this properly?" + **Start a 15-min lesson** button. Trigger rule (binding, deterministic — not model vibes): the handoff card renders when the assistant's answer exceeds 120 words **or** the user sends a second follow-up question on the same topic within one assistant conversation. Tap → session with `entry='free_chat_handoff'`, topic_key from the assistant's topic resolution (free topic if no atom matches), and `emotional_context` set to `'setback'` iff the triage detected the phrase class "I failed / I bombed / I don't get anything" (a fixed regex list in config — crude on purpose; P2 replaces it).
4. **Individual tier — review queue / goal / prep countdown** (09): (a) quiz/review results screens' existing "Fix with Petros" verb → session `goal='remediation'`, pre-scoped to the missed atoms, `emotional_context='neutral'` (P1; `'setback'` wiring is P2). (b) The commitment card's "Study now" on Today → session on the plan engine's next topic, `goal` = `'revision'` if `target_date` < 14 days else `'acquisition'`. (c) Prep countdown screen "Quick revision" → `goal='revision'`, budget 20.
5. **Not in P1:** marks-screen "See what to fix" and exam-card entries (P2) — but every P1 session already accepts `goal` and `emotional_context`, so P2 wires doors, not plumbing.

**Today-feed nudge (rides Chat 4's obligation contract, binding):** max one Learn nudge per user per day, only on a real signal — P1's only signal is an individual-tier commitment with a generated plan block for today. Copy: "⟨Topic⟩ — ⟨N⟩ min lesson ready." Never "come chat with Petros." Delivered as a feed card only; **no push notification for Learn in P1**. The only Learn-related notification anywhere in P1 is nothing — sessions are foreground-initiated; notifications fire only on state changes, and P1 has no background state changes.

## §6. "Why this?" transparency

Every block header carries a barely-there ⓘ (12px, muted) — tap opens a tooltip/popover with the planner's `plan_reasoning` rewritten by nothing (raw stored string, which the plan prompt instructs to write student-readable: "You missed the prerequisite check, so we're rebuilding that first."). If the block is `degraded`, the tooltip says "I improvised this one." P1 ships the logging **and** the tooltip (pulling the tooltip forward from P2 costs one popover; the differentiation is worth it — the stored string exists either way).

**Policy footer (driven by `policy_snapshot`, empty in P1):** the session screen reserves a footer region that renders the disclosure line ("Your school can see session summaries") when `session_context.policy_snapshot.visibility != 'none'`. In P1 the student-tutor scope of `resolve-policy` returns `visibility:'none'` for every user, so the region is empty — but the wiring exists, so P3 flips a value, not a layout.

## §7. Exit & save

Back chevron or overflow "End lesson" → the exit sheet: session recap (checkpoints done / total, artifacts count), primary **Save to Library & exit**, secondary **Exit without saving**, ghost **Keep going**. "Save to Library" writes the session as a Library material: a generated session-notes document (blocks flattened to markdown, questions with the student's answers, canvas thumbnails) filed under the topic's subject — it enters the Library like any material (searchable, workspace-openable). Committed artifacts (cards, canvas) are already saved regardless of this choice — the sheet's fine print says so: "Your 4 flashcards are already in your Library." Exit mid-`awaiting_response` is legal; the pending block is marked `skipped`.
**Natural close (`goal_met`/budget):** after the closing pair, a terminal **completion card**: green ✓, one-liner from `summary`, artifact recap, buttons **Save lesson to Library** (primary) / **Done** (ghost) / plus, when the entry was a learning path, "Next: ⟨next topic⟩ →". This is the payoff state; it must render even when everything else degraded.

## §8. Latency, offline, cache

- First block token < 1.5s p50 / < 3s p95 from POST (plan+render pipelined per file 1 §4.3). Skeletons always carry the move icon — the screen never shows a blank spinner.
- **Offline:** sessions require network. Already-rendered blocks are cached (IndexedDB via the existing student-web cache layer) and readable offline; composer + all interactions disable with a slim top banner "Offline — you can read, interactions resume when you're back." Reconnect auto-resumes the SSE stream with `last_seq`. A session list screen (`/learn/sessions`) shows past sessions from cache offline (read-only).
- Answers submitted at the instant of connection loss: client retries with the same idempotent payload for 30s, then surfaces "Couldn't send — tap to retry" on the block.

## Acceptance criteria — UI & Entry
1. From tap-to-start to first visible content token: p50 < 1.5s, p95 < 3s (measured in `latency_ms`, asserted by the eval harness).
2. A question, once submitted, cannot be re-answered from any client path; UI locks and re-renders the stored result after refresh.
3. The progress bar never decreases; a prereq remediation detour adds exactly one segment.
4. Composer input during `awaiting_response` is accepted, queued, and answered as the next-plus-one block; it never unlocks or bypasses the pending interaction.
5. All four overflow verbs work on every block type, and "Explain simpler/deeper" never advances a checkpoint.
6. Wrong answers render amber, never red, anywhere in the session UI.
7. Ending a session without saving still leaves every committed flashcard/canvas artifact in the Library; the exit sheet states this.
8. The completion card renders for every `closed` session with `end_reason != 'abandoned'`, including sessions containing degraded blocks.
9. Scroll position is never programmatically moved while the student has scrolled up; the "↓ New" pill appears instead.
10. Offline mid-session: blocks remain readable, interactions disable with the banner, and reconnection resumes streaming with no duplicated or missing blocks.
11. The free-chat handoff card appears iff the deterministic trigger rule fires; the assistant never runs an un-orchestrated teaching sequence longer than one answer.
12. Exactly zero push notifications originate from the Learn module in P1; the Today nudge appears at most once per day and only with a real plan signal.
13. Every block shows the ⓘ tooltip with non-empty stored reasoning (or the degraded copy).
14. Path-entry sessions mark the path topic complete under the same conditions the legacy flow did; path progress UIs need no changes.
