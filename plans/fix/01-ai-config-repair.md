# Plan 01 — AI config repair: make OpenAI calls succeed, make failure visible

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: none. GATE-IN: API boots (`corepack pnpm@9.15.9 --filter @edrion/api dev`
> shows Nest startup with no errors). If it doesn't boot, stop and report.

## 1. Objective

Every OpenAI call in the backend currently fails because the configured model IDs are placeholders
that don't exist at OpenAI. The API key itself is valid. Fix the model configuration, and add
error visibility so a misconfiguration can never again hide behind silent fallbacks. Done = a
student Learn intent request returns genuinely AI-generated output, and any AI failure is loudly
logged with the model ID.

## 2. Current state (verified 2026-07-07; re-confirm before editing)

- `.env` lines 103–106: `OPENAI_API_KEY` (valid `sk-proj-…` key), then
  `OPENAI_MODEL=gpt-5.4-mini`, `OPENAI_SMALL_MODEL=gpt-5.4-nano`,
  `OPENAI_BIG_MODEL=gpt-5.4-2026-03-05`. **These three model IDs are placeholders and are
  rejected by OpenAI.**
- `packages/config/src/index.ts` lines 145–153: the zod env schema defaults are the SAME
  placeholder IDs (`gpt-5.4-mini` / `gpt-5.4-nano` / `gpt-5.4-2026-03-05`).
- Two independent AI stacks read these vars:
  1. **Student Learn AI** — `apps/api/src/modules/student/learn-ai/openai.provider.ts`
     (`OpenAiLearnProvider`). Maps tiers nano/small→`OPENAI_SMALL_MODEL`,
     large/vision→`OPENAI_BIG_MODEL` (lines 13–33). Uses the OpenAI **Responses API**
     (`responses.create`) with `text.format.type: 'json_schema'`. NOTE line 63: it sends a
     degenerate schema `{ type: 'object' }` with `strict: false` instead of the real schema —
     see Task 4.
  2. **Institution Petros** — `apps/api/src/modules/portal/petros/openai-client.service.ts`
     (`PetrosOpenAiService`). Tiers: chat→`OPENAI_MODEL`, small→`OPENAI_SMALL_MODEL`,
     big→`OPENAI_BIG_MODEL`. Has real streaming (`streamResponse`).
- **The masking bug:** `apps/api/src/modules/student/learn-ai/router.service.ts` catches ALL AI
  errors during intent classification and silently falls back to a regex heuristic
  (`heuristicRoute()`). So the Learn intent box "works" while AI is completely dead. Petros (the
  institution side) surfaces its failures; the student side hides them.
- Fallback provider: `learn-ai/learn-ai.module.ts` binds token `LEARN_AI_PROVIDER` to
  `OpenAiLearnProvider` when `OPENAI_API_KEY` is set, else `NullLearnAiProvider` (throws
  `AiUnavailableError`). With the key present, the real provider is active — calls reach OpenAI
  and fail on the bad model ID.

Re-confirm commands:

```
grep -n "OPENAI" .env
grep -n "gpt-5.4" packages/config/src/index.ts
grep -n "heuristicRoute" apps/api/src/modules/student/learn-ai/router.service.ts
```

## 3. Product-spec excerpt (why visibility matters)

> "I can see why." Every number traces to something they did… Trust is the product.

A silently-degraded AI violates this: the app pretends to understand the student while running
regex. Failures must be observable by developers even when the UX degrades gracefully.

## 4. Tasks (in order)

### Task 1 — Discover real model IDs (do this FIRST; do not guess)

Run (PowerShell; read the key from `.env` yourself, never paste it into the plan report):

```
curl.exe -s https://api.openai.com/v1/models -H "Authorization: Bearer <OPENAI_API_KEY>"
```

From the returned list pick three REAL model IDs:
- `OPENAI_MODEL` (interactive chat/agent tier): a current mid-size flagship chat model.
- `OPENAI_SMALL_MODEL` (cheap classifier tier): the smallest/cheapest current model.
- `OPENAI_BIG_MODEL` (quality-critical generation + vision): the strongest available model that
  supports vision input (the learn provider sends `input_image` parts).

Likely candidates are the current `gpt-5*` family (e.g. `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`…) —
but select ONLY from IDs actually present in the `/v1/models` response. All three must support the
**Responses API** with `json_schema` output.

**Escalation:** if the list contains no suitable models (key lacks model access), dump the model
list (IDs only) to the user and STOP.

### Task 2 — Update configuration

- Files: `.env` (lines 103–106 region), `packages/config/src/index.ts` (lines 149–153 defaults).
- Change: replace the three `gpt-5.4-*` values with the IDs chosen in Task 1, in both places
  (env values and schema defaults must both be real so a missing env line still yields a working
  system).
- Acceptance: `grep -rn "gpt-5.4" .env packages/config/src/index.ts` returns nothing.
- Restart the API dev process afterward (ts-node-dev does not watch `.env`).

### Task 3 — Make AI failure visible (keep the fallback)

- File: `apps/api/src/modules/student/learn-ai/router.service.ts`.
- Change: where AI errors are swallowed before `heuristicRoute()`, log at **error** level via the
  Nest `Logger`, including: the model ID used, the OpenAI error status/message, and the text
  `"falling back to heuristic routing"`. Do NOT remove the heuristic fallback — graceful UX
  degradation is a product decision; silence is the bug.
- Also grep the other learn-ai services (`planner.service.ts`, `block-generator.service.ts`,
  `evaluator.service.ts`) for equivalent silent `catch` blocks and add the same error logging.
  Do not change their fallback/throw behavior.
- Acceptance: temporarily set `OPENAI_MODEL`/`OPENAI_SMALL_MODEL` to a bogus value, restart, hit
  `POST /v1/student/learn/intent` (authed, body `{"text":"teach me derivatives"}`) → response
  still succeeds (heuristic) AND the API log shows an ERROR line naming the bogus model. Restore
  the real values and restart afterward.

### Task 4 — Fix the degenerate JSON schema (small but real)

- File: `apps/api/src/modules/student/learn-ai/openai.provider.ts` line ~58–65.
- Change: `completeJson` sends `schema: { type: 'object' }` — the model gets no actual output
  schema, so shape correctness depends entirely on prompt luck and the zod `.parse` afterward.
  Convert the provided zod schema (`opts.schema`) to JSON Schema and send that instead. Use the
  `zod-to-json-schema` package if it is already a dependency anywhere in the monorepo
  (`grep -rn "zod-to-json-schema" --include=package.json .`); if it is not, add it to
  `apps/api/package.json` dependencies. Keep `strict: false` (some generated zod schemas contain
  constructs strict mode rejects).
- Acceptance: a `POST /v1/student/learn/quick` (authed, body `{"question":"what is a derivative?"}`)
  returns a well-formed answer object, and the request in OpenAI's dashboard/logs shows a real
  schema. If this change causes schema-rejection errors from OpenAI, revert to `{ type: 'object' }`,
  note it in the report, and move on — Task 4 is best-effort, Tasks 1–3 are mandatory.

### Task 5 — AI health visibility

- File: wherever the API's existing health check lives (`grep -rn "health" apps/api/src --include=*.controller.ts`);
  if none exists, add a tiny `GET /v1/health/ai` controller in a sensible existing module.
- Change: return JSON `{ configured: boolean, models: { chat, small, big }, lastError: string | null }` —
  `configured` = key present; `models` = the three configured IDs; `lastError` = the most recent
  OpenAI error message captured by the logging added in Task 3 (a simple in-memory holder on the
  provider is fine). No live OpenAI call in the health check (cost/latency).
- Acceptance: `curl.exe -s http://localhost:3001/v1/health/ai` returns the configured model IDs.

## 5. Verification gate (GATE-OUT — plan 03/04/05 repeat this as GATE-IN)

1. `corepack pnpm@9.15.9 --filter @edrion/api typecheck` → exit 0.
2. Authed `POST /v1/student/learn/intent` with `{"text":"I keep messing up integration by parts, teach it to me from scratch"}`
   → the response is AI-classified (inspect: the router's heuristic only pattern-matches
   question marks / "teach me" phrases; the API log must show NO "falling back to heuristic"
   error line for this request).
3. Authed `POST /v1/student/learn/quick` with a factual question → a substantive generated answer
   (not an error, not empty).
4. `GET /v1/health/ai` shows the three real model IDs.
5. No `gpt-5.4` string remains anywhere: `grep -rn "gpt-5.4" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans` → empty.

## 6. Out of scope / guardrails

- Do NOT restructure providers, change the tier system, or touch `portal/petros/*` beyond reading.
- Do NOT implement real token streaming (that is Plan 03).
- Do NOT remove `NullLearnAiProvider` or the heuristic fallback.
- Do NOT log or echo the API key anywhere.

## 7. Escalation — stop and report if

- `/v1/models` shows no usable models (Task 1).
- The key itself is rejected (401 from OpenAI).
- `router.service.ts` does not contain the described silent fallback (working tree changed).
