# Debate P1 — Implementation Record

**Status:** Pilot-ready for core round pipeline; calibration console and CI eval gates shipped in this pass.

## Migrations

`0110`–`0119` (core schema, flags, format seeds, capture/adjudication indexes, retention marker).  
`0180` — system motion bank seeds (~30 motions).

## Capabilities

- `lab.debate.enabled` (default off)
- `lab.debate.ai_opponent`, `lab.debate.spar_1v1` (phase-gated)

## API (`apps/api/src/modules/student/debate`)

| Route | Purpose |
|-------|---------|
| `GET /student/debate/formats`, `GET /student/debate/motions` | Catalog |
| `POST /student/debate/rounds` | Create round (`practice_vs_ai` / `spar_1v1`) |
| `POST …/consent` | Blocking consent before capture |
| `POST …/start-prep`, `POST …/advance` | Prep → speaking |
| `GET|PUT …/prep-notes` | Versioned prep pad |
| `POST …/turns/:turnId/chunks` | Resumable audio chunks (403 without consent) |
| `POST …/turns/:turnId/finalise` | Enqueue `debate.stt` |
| `GET …/transcript` | Canonical transcript |
| `POST …/adjudicate` | Manual adjudicate (job also auto-fired) |
| `GET …/report`, `GET …/clash-map` | Feedback + graph |
| `POST|DELETE …/share`, `DELETE …/round` | Share link + deletion |

**Portal calibration:** `GET /portal/debate/calibration/reviews`, `POST …/model-pin` (audit + settings permissions).

## Jobs (BullMQ `ai` / `maintenance`)

- `debate.stt`, `debate.opponent`, `debate.adjudicate`
- `debate.retention_sweep` — daily on maintenance queue when Redis workers enabled

## Student web

- `/lab/debate/*` — new round, consent, prep, speak, deliberating, report, spar join
- Hooks: `lib/hooks/debate-lab.ts`, `use-debate-recorder.ts`
- TTS via `ConfigTtsProvider` — `openai` (default when `OPENAI_API_KEY` set) or `mock`

## CI gates (blocking)

- `debate-eval-harness.spec.ts` — 20-round quote validation corpus
- `debate-consent.integration.spec.ts` — consent required before chunk upload
- `debate-wer-harness.spec.ts` — quote corpus; live Deepgram when `DEBATE_WER_FIXTURE=1` + `DEEPGRAM_API_KEY`

## Tests

- API vitest includes debate unit + integration specs above (`pnpm --filter @edrion/api test`)

## Manual smoke

1. Enable `lab.debate.enabled` for institution.  
2. Create round → consent all scopes → prep → record chunk → finalise → await report.  
3. Without consent, chunk upload returns 403 `CONSENT_REQUIRED`.
