# Plan 03 — Real streaming: session blocks and Ask Petros

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: Plan 01 complete. GATE-IN: authed `POST /v1/student/learn/quick` returns a real
> AI-generated answer and `GET /v1/health/ai` shows real model IDs. If not, stop.

## 1. Objective

The guided-session canvas is designed around blocks streaming in one at a time ("generation feels
alive rather than dumped"), and the SSE plumbing exists end-to-end — but the learn AI provider
fakes it: it waits for the ENTIRE OpenAI response, then yields the array items in a burst. Ask
Petros likewise returns one blob instead of streaming. Done = blocks appear progressively during
generation, and Ask Petros answers stream token-by-token into the drawer.

## 2. Current state (verified 2026-07-07; re-confirm before editing)

- **Fake streaming:** `apps/api/src/modules/student/learn-ai/openai.provider.ts` lines 82–96 —
  `streamJsonArray` calls `completeJson` (fully buffered `responses.create`), then iterates the
  finished array. No `stream: true` anywhere in this provider.
- **Real streaming reference implementation in the same repo:**
  `apps/api/src/modules/portal/petros/openai-client.service.ts` — `streamResponse()` uses
  `responses.create({ …, stream: true })` and iterates the event stream. Copy its patterns.
- **SSE transport already works:** `apps/api/src/modules/student/learn/sessions.controller.ts`
  exposes `GET /v1/student/learn/sessions/:id/stream` writing `text/event-stream` `data:` frames
  with a `[DONE]` sentinel. The frontend consumes it via the `sse()` helper in
  `apps/student-web/src/lib/student-client.tsx` (line ~116) from
  `apps/student-web/src/lib/hooks/useLearnSession.ts` (line ~33, `startStream`). The transport is
  NOT the problem — only the provider buffering behind it.
- **Ask Petros is non-streaming:** `apps/student-web/src/components/learn/AskPetrosDrawer.tsx`
  submits via a plain mutation (`useAsk` → `POST /v1/student/learn/ask`) and renders the complete
  answer at once. Backend: `apps/api/src/modules/student/learn/ask.controller.ts` + `ask.service.ts`.

Re-confirm:

```
grep -n "streamJsonArray" apps/api/src/modules/student/learn-ai/openai.provider.ts
grep -n "stream" apps/api/src/modules/student/learn/ask.controller.ts
grep -n "startStream" apps/student-web/src/lib/hooks/useLearnSession.ts
```

## 3. Product-spec excerpts (verbatim)

> **Streaming blocks** — Blocks arrive one after another; each begins its settle animation the
> moment its type + header stream in, so generation feels alive rather than dumped. A block is
> only interactive once fully streamed. … If generation stalls, show a quiet "Petros is thinking…"
> shimmer on the pending block — never a full-screen spinner that hides what already streamed.

> **Ask Petros drawer** — The drawer slides in showing "Asking about: [current block]" so the
> student knows it already has context. … The answer is scoped to the current block.

## 4. Tasks (in order)

### Task 1 — Real streaming in `streamJsonArray`

- File: `apps/api/src/modules/student/learn-ai/openai.provider.ts`.
- Change: rewrite `streamJsonArray` to call `responses.create({ …, stream: true })` and consume
  the Responses API event stream, accumulating `output_text` deltas. Incrementally parse the
  growing JSON buffer and `yield` each completed element of the target array
  (`opts.arrayKey ?? 'blocks'`) as soon as its closing brace balances — do not wait for the full
  response. Validate each yielded element with `opts.schema.parse` (as the current code does).
  A depth-counting brace/bracket scanner over the delta text is sufficient; track string/escape
  state so braces inside strings don't miscount. Keep usage accounting: the final stream event
  carries token usage — preserve whatever usage reporting `completeJson` feeds to callers/loggers
  (check how `LearnAiStreamOpts` and the callers in `block-generator.service.ts` handle usage,
  and keep that contract intact).
- Acceptance: unit-testable — add a small vitest for the incremental array parser (feed it a JSON
  array in random-sized chunks; expect elements emitted before the input completes).

### Task 2 — Observe end-to-end progressive delivery

- No code change expected; the SSE controller already forwards blocks as they're yielded.
- Verify: start a fresh session (authed `POST /v1/student/learn/sessions` with a topic, or via the
  UI), then `curl.exe -N -b cookies.txt http://localhost:3001/v1/student/learn/sessions/<id>/stream`
  and watch frame arrival times. Acceptance: the first `data:` block frame arrives well before the
  final one (multi-second gap on a multi-block plan), instead of all frames in one burst.
- In the browser, watch the session canvas: blocks appear one by one with the settle animation.

### Task 3 — Stream Ask Petros

- Files: `apps/api/src/modules/student/learn/ask.controller.ts`, `ask.service.ts`,
  `apps/student-web/src/lib/hooks/useAsk.ts`,
  `apps/student-web/src/components/learn/AskPetrosDrawer.tsx`.
- Change (backend): add a streaming variant of the ask endpoint that emits the answer as SSE
  `data:` text-delta frames ending with a `[DONE]` sentinel, following the exact conventions of
  `sessions.controller.ts`'s stream endpoint (same headers, same sentinel). Keep the existing
  non-streaming endpoint working (other callers may use it). The provider call can use a plain
  streamed text completion (a new small `streamText` method on the learn provider, modeled on
  petros `streamResponse`) — ask answers are prose, not JSON.
- Change (frontend): in the drawer, render the answer progressively as deltas arrive via the
  existing `client.sse()` helper; keep the final message identical to what the non-streaming path
  would have returned (the conversation history persistence must still happen server-side).
- Acceptance: asking a question in the drawer shows text growing token-by-token; on completion the
  message is stored (reopening the drawer shows the full turn history as before).

## 5. Verification gate (GATE-OUT — Plan 04 repeats as GATE-IN)

1. `--filter @edrion/api typecheck` and `--filter @edrion/student-web typecheck` → exit 0;
   the new parser vitest passes (`--filter @edrion/api test`).
2. `curl.exe -N` on a fresh session stream shows temporally spread block frames (record two
   timestamps in the report).
3. Drawer answer visibly streams in the browser; turn history persists.

## 6. Out of scope / guardrails

- Do NOT change block schemas, block types, or the SSE frame format the frontend already parses —
  the existing session stream consumer must keep working unchanged.
- Do NOT touch `portal/petros/*` (read-only reference).
- Do NOT add websockets; SSE only.
- Keep `completeJson` untouched except as needed for shared helpers.

## 7. Escalation — stop and report if

- The Responses API streaming event shapes don't match what the petros reference handles (SDK
  version drift) — report the SDK version and observed event names.
- The sessions SSE controller turns out to buffer server-side too (i.e. Task 2 still shows a
  burst after Task 1 is provably yielding incrementally) — report where the buffering happens
  before changing the controller.
