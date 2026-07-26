# Tier 3 Plan — Debate P1

## Execution header

| Field | Value |
|---|---|
| **Target feature** | Debate P1 — solo recording, STT, adjudication, Clash Map, Prep Pad, AI opponent, invite-only 1v1 |
| **Attach at execution** | `/Users/macbook/Downloads/06S3-DEBATE-P1-HYPERSPEC.md` |
| **Prerequisites (IMPLEMENTED)** | `IMPLEMENTED.md`, `IMPLEMENTED-GRAPH-PIPELINE.md`; **hard Tier 2 gate:** `IMPLEMENTED-EDRION-LEARN.md`, `IMPLEMENTED-DOCUMENTS.md`, `IMPLEMENTED-MOCK-EXAMS.md` not required for Debate start (Debate depends on Graph only for Tier 3 track gate per program; Tier 2 trio required by program overview before any Tier 3 Phase 1 — execute Debate Phase 1 only after overview gate cleared or waived) |
| **Migration numbers reserved** | `0110`–`0119` |
| **Track and position** | Track A, position 1 of 2 (before Entrance Prep) |
| **Feature surface and capability flags** | Module: `student.surface.lab` (existing). Capabilities: `lab.debate.enabled`, `lab.debate.spar_1v1` (phase-gated), `lab.debate.ai_opponent` (phase-gated). Do **not** add `student.module.debate`. |
| **Open blockers** | Tier 2 program gate; WER acceptance benchmark corpus; Deepgram API keys in vault |
| **Human decisions** | HD-T3-002 canvas FK (resolved: `debate_id`); HD-T3-003 STT (resolved: Deepgram via interface) |
| **Conditions before Phase 1** | Graph `buildClashMap` stub present; read existing `debates`/`debate_turns` columns; reserve `0110` on journal tip |

---

## 1. Summary

Debate P1 proves recorded-audio adjudication end-to-end before any realtime or WebRTC work. Students practice against a motion with per-turn `MediaRecorder` capture, resumable upload, batch STT, immutable canonical transcripts, LLM adjudication (claim/mechanism/example/impact/comparative), beta-labelled scores, feedback reports, and a Clash Map rendered through the frozen **CanvasGraph v1** comparison contract (≤40 nodes). `debates.id` is the round identity. Canvas provenance closes via **`visual_canvases.debate_id`** nullable FK to `debates.id` ON DELETE SET NULL, plus validated `source_meta` for transcript and adjudication-run references.

Locked sequencing: **solo pipeline complete** (consent → record → upload → STT → metrics → analysis → verdict → report) **before** Prep Pad + AI opponent (Phase 4) or 1v1 (Phase 5).

---

## 2. Current repository state

### 2.1 Existing tables (`packages/database/src/schema/student-knowledge.ts`)

**`debates`** (minimal substrate): `id`, `institution_id`, `student_id`, `independent_user_id`, `motion`, `side`, `format`, `mode`, `invite_token_hash`, `stage` (default `setup`), `turn_seconds`, `feedback` jsonb, **`audio_seam` jsonb on debates row** (not on turns), `version`, timestamps. Indexes: `debates_owner_idx` on `(student_id, created_at)`.

**`debate_participants`:** `debate_id`, `role`, `student_id`, `independent_user_id`, `display_name`, `side`, `joined_at`.

**`debate_turns`:** `debate_id`, `sequence`, `round`, `speaker_role`, `text` (required), `audio_object_id` → `storage_objects`, `created_at`. **No** `audio_seam`, `capture_state`, `stt_state`, `transcript_id`.

**Dual-owner:** Repo uses `student_id` + `independent_user_id` + optional `institution_id` with XOR checks elsewhere — **not** hyperspec `owner_user_id`.

### 2.2 Graph (`packages/database/src/schema/visual-studio.ts`)

- `visual_canvases`: `origin` CHECK includes `debate_clash`; no `debate_id` column yet.
- `CanvasGraphService.buildClashMap` throws `NOT_IMPLEMENTED` (`apps/api/src/modules/student/visual-studio/canvas-graph.service.ts`).

### 2.3 API / modules

- No `apps/api/src/modules/debate` module.
- Student storage: `StudentStorageService` for uploads.
- No STT vendor code in repo (greenfield).

### 2.4 Migrations

- Journal tip: `0096_lab_canvas_flags`. Debate range starts at **0110**.

---

## 3. Spec Amendments

| # | Hyperspec claim | Repo truth | Plan action |
|---|---|---|---|
| A1 | `debate_turns` already has `audio_seam` | `audio_seam` on **`debates`**, not turns | Add turn-level seam in migration; migrate or deprecate debate-level seam with backfill note |
| A2 | Dual-owner `owner_user_id` | `student_id` / `independent_user_id` XOR | All new tables use repo convention |
| A3 | `graph-json@1.1` for clash | Frozen **CanvasGraph v1** only | Implement clash via existing `clash` edge kind + `buildClashMap`; no new schema version |
| A4 | Feature flags `student.module.*` | Obsolete namespace | Use `student.surface.lab` + `lab.debate.*` capabilities |
| A5 | Whole-buffer upload path | Must not rely on legacy buffer-only upload | **Resumable chunked upload** API (new) per hyperspec §5.1 |
| A6 | C8 "no whisper/deepgram" | Absent = greenfield | Deepgram batch behind `SttProvider` interface (approved) |

---

## 4. Dependencies and shared contracts

**Reads:** `VisualRevisionService`, `CanvasGraph` types (`@edrion/schemas`), `storage_objects`, `StudentStorageService`, BullMQ, `learn_ai_calls` / copilot provider for adjudication, feature flags, audit writer.

**Implements:** `CanvasGraphService.buildClashMap({ owner, debateRoundId, transcriptRef, nodeBudget ≤ 40 })` — real implementation replacing stub.

**Exposes:** Debate round lifecycle API, transcript immutability contract, Clash Map canvas id via `visual_canvases.debate_id`, beta analytics labels.

---

## 5. Migration-first PR (Phase 1 — `0110`–`0112`)

### Goal

Land all Debate tables/columns, canvas FK, format seeds, RLS/grants; feature flags off.

### Non-goals

STT integration, UI, adjudication prompts.

### Dependencies

`0096` applied; Graph contract frozen.

### Files

- `packages/database/migrations/0110_debate_core.sql` (and `0111`/`0112` if split)
- `packages/database/src/schema/debate.ts` (new) + export from schema index
- `packages/database/migrations/sql/zzz_rls.sql`, `zzz_grants.sql` companions
- `packages/feature-flags` — register `lab.debate.enabled`
- `packages/schemas/src/student/debate/*` — enums, FormatSpec, lifecycle statuses

### Schema (additive / new)

**ALTER `debates`:** Add columns per hyperspec §2.1 where not conflicting: `format_key`, `format_version`, `motion_id`, `motion_text`, `motion_info_slide`, `prep_seconds`, `scaffolds_enabled`, `ai_opponent_difficulty`, `status` (FSM), `consent_policy_version`, `retention_policy`, `started_at`, `ended_at`, `current_turn_index`, `score_confidence`, retain legacy `motion`/`stage` with backfill map `stage` → `status` one-time job. Keep `debates.id` as round PK.

**ALTER `debate_participants`:** `seat_key`, `participant_kind`, `ai_persona_key`, `tts_voice_key`, `consent_id`, `ready_at`, `left_at`; unique `(debate_id, seat_key)`.

**ALTER `debate_turns`:** `turn_index`, `seat_key`, `speech_kind`, `planned_duration_ms`, `actual_duration_ms`, `started_at`, `ended_at`, `deadline_at`, `overtime_ms`, `text_content`, `capture_state`, `stt_state`, `transcript_id`, **`audio_seam` jsonb**; rename/map `sequence` → `turn_index` with compatibility view or column alias in API layer.

**ALTER `visual_canvases`:** `debate_id uuid NULL REFERENCES debates(id) ON DELETE SET NULL`; index `(debate_id) WHERE debate_id IS NOT NULL`.

**NEW tables:** `debate_formats`, `debate_motions`, `debate_prep_notes`, `debate_transcripts`, `debate_adjudication_runs`, `debate_adjudication_calls`, `debate_speech_analyses`, `debate_clashes`, `debate_verdicts`, `debate_speaker_scores`, `debate_feedback_reports`, `debate_consents`, `debate_skill_snapshots`, `debate_ai_opponent_scripts`, `debate_motion_suggestions` — column-level per hyperspec §2.4–2.16 with **owner columns** = `institution_id`, `student_id`, `independent_user_id` + XOR CHECK matching `visual_canvases_subject_ck` pattern.

**Indexes / constraints:** Partial indexes on non-terminal `debates.status`; immutability: no UPDATE on `debate_transcripts.text`/`words` via grants; append-only `debate_adjudication_calls`.

### RLS

- Institutional debate rows: `institution_id` GUC.
- Personal prep notes: user-scoped policy (`student_id` or `independent_user_id` = principal).
- Transcripts/reports: dual-owner read matching round owner.

### API (stubs)

- `POST /v1/student/debate/rounds` — create draft (Zod: `createDebateRoundSchema`)
- Feature guard: `lab.debate.enabled`

### Data flow

Migration only; seed `debate_formats` for `spar_1v1`, `practice_solo` (`is_buildable=true`) and BP/AP/Oxford/LD (`is_buildable=false`).

### Tests

- Schema snapshot; RLS deny cross-tenant; XOR owner insert fixtures.

### Definition of done

- Migrations apply cleanly; flags registered; no runtime routes required yet.

---

## 6. Ordered implementation PR phases

### Phase 2 — Solo recording, consent, upload, STT, transcript, metrics (`0113`–`0114`)

**Goal:** End-to-end solo turn: consent → mic check → record → resumable upload → Deepgram batch → canonical transcript + deterministic metrics.

**Non-goals:** Adjudication, Clash Map, AI opponent.

**Dependencies:** Phase 1 merged.

**Files:** `apps/api/src/modules/student/debate/*`, `apps/student-web` debate routes under `/lab/debate`, `packages/schemas/src/student/debate/capture.ts`, `stt-provider.ts`, `deepgram-stt.provider.ts`, BullMQ job `debate.stt`.

**API routes:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/student/debate/rounds/:id/consent` | Record `debate_consents` |
| POST | `/student/debate/rounds/:id/turns/:turnId/chunks` | Resumable chunk upload (idempotent chunk idx) |
| POST | `/student/debate/rounds/:turnId/finalise` | Close turn, enqueue STT |
| GET | `/student/debate/rounds/:id/turns/:turnId/transcript` | Canonical + display transcript |

**Zod:** `debateConsentSchema`, `audioSeamSchema`, `sttWordSchema`, `transcriptDisplaySchema`.

**Service ownership:** `DebateCaptureService`, `DebateSttService` (provider interface), `DebateTranscriptService`.

**Jobs:** `debate.stt` — input object ref, keyterms, language `en-IN`; output new `debate_transcripts` row; update `debate_turns.transcript_id`, `stt_state`.

**UI:** Consent screen (blocking before `getUserMedia`), mic check, recording with chunk upload progress, interstitial copy between turns.

**States:** loading skeleton; empty (no turns); error with retry; offline queue for chunks; success transcript view.

**Idempotency:** Chunk upload `Idempotency-Key` per `(turn_id, chunk_idx)`; finalise once → 409 if already stored.

**Security:** Consent scopes granular; minor guardian link field nullable FK to existing parental consent when institution student + under threshold.

**Tests:** Unit seam validator; integration STT mock; contract tests for immutable transcript UPDATE denied.

**DoD:** Recorded audio → stored object → transcript row → metrics json on transcript; WER gate documented for prod enable.

---

### Phase 3 — Analysis, clashes, verdict, scores, report, Clash Map (`0115`–`0116`)

**Goal:** Adjudication pipeline + feedback report + `buildClashMap` implementation.

**Non-goals:** Prep pad persistence beyond read-only preview; 1v1.

**Dependencies:** Phase 2; solo pipeline acceptance tests green.

**Files:** `debate-adjudication.service.ts`, `debate-judge.prompts.ts`, extend `canvas-graph.service.ts`, `visual-studio.service.ts` create clash canvas with `debate_id` set.

**API:**

| Method | Path |
|---|---|
| POST | `/student/debate/rounds/:id/adjudicate` |
| GET | `/student/debate/rounds/:id/report` |
| GET | `/student/debate/rounds/:id/clash-map` |

**Pipeline:** Run record → speech analyses → clashes → verdict → speaker scores → feedback report; `debate_adjudication_calls` append-only; `score_confidence='beta'` frozen on verdict.

**Clash Map:** Call `buildClashMap` with `nodeBudget <= 40`; commit canvas via `VisualRevisionService` with `origin='debate_clash'`, `debate_id`, `source_meta: { run_id, transcript_refs }`.

**UI:** Report reader, radar anatomy axes, beta badges, Clash Map viewer reusing lab canvas components.

**Tests:** Golden JSON for judge stages; clash node count cap; quote validator overlaps low-confidence spans.

**DoD:** Solo round reaches `report_ready` with clash canvas linked.

---

### Phase 4 — Prep Pad and recorded AI opponent (`0117`)

**Goal:** `debate_prep_notes` (user-owned RLS), practice_solo AI turns with TTS script table, still no WebRTC.

**Dependencies:** Phase 3 gate passed.

**API:** CRUD prep notes (optimistic `version`); `POST .../opponent-turn` generates `debate_ai_opponent_scripts` + synthetic transcript path (`stt_state=skipped_ai`).

**UI:** Prep pad blocks, scaffold templates, visible `ai_assist_used` flag on round.

**Flag:** `lab.debate.ai_opponent`.

**DoD:** Full practice_solo round with AI speeches and student speeches adjudicated.

---

### Phase 5 — Invite-only recorded 1v1 (`0118`)

**Goal:** `spar_1v1` with invite token, async turn taking, no WebRTC.

**Dependencies:** Phase 4.

**API:** Invite create/accept; turn ownership enforcement; same capture/STT path per participant.

**Flag:** `lab.debate.spar_1v1`.

**DoD:** Two human participants complete round with separate per-turn audio and joint adjudication.

---

### Phase 6 — Accessibility, moderation, observability, performance, launch (`0119`)

**Goal:** NSFW motion gating, reduced motion, metrics dashboards, rate limits, retention jobs.

**Jobs:** Audio retention per `retention_policy`; audit exports; p95 adjudication <90s.

**Tests:** Load test STT queue; a11y axe on primary flows.

**DoD:** Production checklist; feature flag default off with pilot institutions.

---

## 7. Security, privacy, and safety

- Consent in first recording phase (legal).
- Canonical transcript immutability; display cleanup never overwrites canonical.
- Minor safety: motion `nsfw_flags`, guardian consent linkage.
- Prep notes: student-only RLS; staff cannot read.
- Beta labelling on scores/verdicts/analytics UI + DB `score_confidence`.

---

## 8. Risks and failure modes

| Risk | Guard |
|---|---|
| STT accent WER | Provider interface + benchmark gate; keyterms |
| LLM quote fabrication | Quote validator anchors `words[]` only |
| Clash Map dialect fork | Single CanvasGraph v1 |
| Legacy `debate_turns.text` required | Backfill placeholder for old rows; new human turns use NULL `text` + transcript |

---

## 9. Test plan

- Unit: FSM transitions, seam gap invalidates quotes, token diff for display cleanup.
- Integration: full solo pipeline with mocked Deepgram.
- Contract: Graph clash fixture parity with `validateClashFixture`.
- RLS: prep notes isolation.
- UI: consent gating order (consent before mic permission).

---

## 10. Acceptance criteria

1. Solo recorded round completes to report with beta-labelled scores.
2. `visual_canvases.debate_id` binds clash canvas; `source_meta` documents run.
3. No WebRTC dependencies in bundle.
4. `buildClashMap` no longer throws NOT_IMPLEMENTED.
5. Resumable upload survives tab kill (manifest in `audio_seam.chunks`).
6. Re-judging creates parallel run; primary run flag drives UI.

---

## 11. Operational readiness

- Deepgram credentials via institution/platform secret store.
- BullMQ queue depth alerts for `debate.stt` and adjudication.
- Runbook: re-transcription creates new transcript row.

---

## 12. Closeout

Write **`IMPLEMENTED-DEBATE.md`** with: migrations list, API index, flag keys, deviations from hyperspec (amendments §3), exposed contracts for Prep (none required beyond graph/stub closure), WER benchmark results.
