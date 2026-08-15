# Execution prompt 07 of 13 — Stage 7: learner-owned artifacts and persistence

Use this prompt after Stage 6 personalization is complete. Build durable artifacts and review
scheduling. Do not begin the additional entry points in Stage 8.

## Mission

Make every completed Petros session leave useful residue the student owns: curated flashcards in a
review deck, editable diagrams on a canvas, and source-linked notes. Replace local/mock artifact
counts with durable storage and implement the mandatory `propose → student edits → explicit save`
flow. Schedule saved cards for spaced review, tightening appropriately as an exam approaches.

Never auto-save AI output as the student’s own. The curation step is part of learning and is a hard
product rule.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 5, 6, 9, 10,
   and Stage 7.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect the Stage 1 artifact rail, session close flow, learner
   model, existing notes/cards/canvas/document storage, and exam/calendar entities.
3. Verify Stage 6 same-topic personalization with two synthetic learners and inspect causal factors.
4. Reuse existing Edrion storage/deck/canvas/note concepts where sound. Do not create duplicate
   feature silos.
5. Preserve unrelated changes and do not migrate a shared database without authority.

## Artifact domain model

Define typed, versioned artifact contracts with student ownership, portable identity, institution
scope where policy requires it, session/source provenance, revision history, and lifecycle state.

### Flashcards

- stable card ID, front, back, optional hint/explanation, concept/topic tags;
- source session/block and source document/page references;
- proposal, edited draft, saved, archived/deleted states;
- content/prompt/schema versions and edit history;
- review scheduling state, exam-aware adjustments, and review outcomes.

### Diagrams

- structured editable representation, rendered preview, accessible description;
- canvas placement/document metadata;
- source topic/session/block and generation version;
- proposal/edit/save/revision lifecycle;
- safe SVG/image handling, sanitization, and export behavior.

### Notes/snippets

- student-edited rich or structured text within existing editor conventions;
- citations to source documents/pages/assessment/session blocks;
- concept/topic tags, revisions, and provenance;
- proposal/edit/save lifecycle.

Separate AI proposals from student-owned saved artifacts. A proposal must not appear in decks,
canvas, search, review schedule, export, or ownership counts until the student explicitly saves it.

## Session-close and curation flow

- PLAN/RENDER may propose artifacts during the session, but close must present a reviewable bundle.
- The student can edit, select/deselect, save, discard, or return to the session.
- Validate/sanitize after edits without replacing the student’s words silently.
- Commit selected artifacts transactionally and idempotently. A retry cannot duplicate cards/notes.
- If one artifact fails, show actionable recovery and do not claim the entire bundle saved.
- Update the artifact rail/sheet live from authoritative state.
- Record a clear audit/provenance event while avoiding surveillance-like edit histories in ordinary UI.
- Closing should include a forward link/unfinished thread but no guilt or fake urgency.

## Spaced-review scheduling

Implement a documented, testable scheduling policy:

- new card first review and subsequent intervals based on performance/confidence;
- failed/fragile cards return sooner;
- interval tightens safely as a known exam date approaches;
- no impossible, duplicate, or retroactive due dates;
- timezone-aware due calculation;
- pause/archive/delete behavior;
- rebuild/versioning of schedule logic without losing review history;
- mixing across topics with student-facing explanation that the added difficulty is intentional.

Use deterministic code for scheduling. Do not spend AI calls on arithmetic scheduling.

## Backend/API/storage requirements

- Persistence/migrations for proposals, saved artifacts, revisions, sources, deck membership, review
  state/history, and canvas linkage, reusing existing models where appropriate.
- Endpoints/commands for proposal bundle read/edit/select/commit/discard; artifact read/update/delete;
  review due/submit; canvas open/update; note source navigation.
- Strict ownership and tenant authorization, idempotency, optimistic concurrency, validation,
  sanitization, rate/size limits, and audit.
- Secure object storage and signed access for binary previews where required.
- Search/indexing only after explicit save.
- Export/deletion/transfer hooks. Student-owned artifacts must travel across an approved institution
  change without exposing the former institution’s restricted source content.
- Learner-model updates from review outcomes without circularly counting proposal generation.

## Student frontend requirements

- Artifact rail on desktop and swipe-up sheet on mobile shows authoritative live counts and states.
- Every proposed item clearly says “Proposed by Petros” and “Edit before saving.”
- Provide accessible editors/previews and individual/bulk selection without deceptive defaults.
- Save feedback distinguishes saved, failed, pending, and unsaved items.
- Deck view shows due cards, source/topic, and exam-aware schedule explanation.
- Canvas opens diagrams in editable form with accessible description and safe fallback.
- Notes link back to precise source pages/blocks and handle unavailable/restricted sources honestly.
- Refresh/resume/offline/retry cannot lose edits or duplicate artifacts.
- Mobile, keyboard, screen-reader, zoom, reduced-motion, and slow-network behavior must be polished.

## Dashboard/observability requirements

Provide authorized operational views with privacy-preserving aggregates:

- proposal → edited → saved conversion by artifact type;
- save failures, duplicate prevention, sanitization failures, and latency;
- review due/completion/retention metrics and scheduler version;
- artifact-generation AI cost/latency/validation/fallback by function;
- storage usage and failed object operations;
- source-link health and orphaned artifacts;
- transfer/export/deletion job status.

Do not expose student artifact content to Super Admin by default. Identifiable support access must use
existing privileged/audited flows.

## Automated verification required

Cover at least:

- proposal is not a saved artifact and is absent from deck/canvas/search/export;
- edit then explicit save preserves student changes and provenance;
- deselect/discard creates no owned artifact;
- idempotent commit and partial-failure recovery;
- XSS/SVG/file sanitization and content/size limits;
- card scheduler intervals, confidence/performance effects, exam tightening, timezone boundaries,
  archive/delete, and algorithm rebuild;
- review outcome updates learner evidence exactly once;
- source links resolve and restricted/missing sources degrade safely;
- diagram editable representation and accessible description;
- session resume retains unsaved edits without claiming ownership;
- ownership, cross-tenant denial, transfer, export, deletion, and audits;
- AI functions are registered/routed/metered and provider details remain hidden;
- artifact rail counts match database truth;
- Stage 5 residue/stuck/quality rubrics improve or remain non-regressed.

Run focused and affected tests, typechecks, lint, builds, storage/migration checks, and a Stage 5
comparison. Report exact commands/results.

## Mandatory manual QA and dashboard acceptance

Perform available browser testing and provide a human runbook covering:

1. **Proposal-only:** Complete a session that proposes a card, note, and diagram. Before saving,
   verify deck, canvas, search, export, and counts do not treat them as owned.
2. **Edit and save:** Change meaningful text/diagram details, select only some items, save, and verify
   exactly those edited versions appear in deck/canvas/notes with correct provenance.
3. **Discard:** Discard a proposal bundle and confirm nothing persists or returns after refresh.
4. **Retry/idempotency:** Simulate a timeout/double-click during commit. Confirm no duplicates and
   truthful per-item save status.
5. **Review schedule:** Inspect a saved card’s first due date, submit success/failure with confidence,
   and verify the next interval. Add an upcoming exam and confirm documented tightening.
6. **Source navigation:** From a note/card, open the precise document page or session block. Test a
   removed/restricted source and confirm an honest fallback.
7. **Diagram:** Open on canvas, edit, save a revision, inspect on mobile and with keyboard/screen
   reader, and confirm safe rendering of hostile fixture content.
8. **Artifact dashboard:** Reconcile proposal/save/review counts, failures, scheduler version, source
   health, and storage events with the manual run.
9. **Petros AI Routing:** Filter flashcard/note/diagram functions and reconcile cost, latency,
   validation, cache, retry, and fallback events.
10. **Privacy/transfer:** Confirm another student/institution cannot read artifacts. In disposable
    fixtures, exercise export, deletion, and approved institution transfer without leaking restricted
    source material.
11. **Responsive/offline:** Test desktop rail, mobile sheet, rotation, slow network, offline edits,
    refresh/resume, keyboard, screen reader, focus, zoom, and reduced motion.

Every check must include navigation, fixture/setup, actions, expected UI, expected API/database or
dashboard evidence, failure conditions, and IDs/screenshots to capture.

## Definition of done

Stage 7 is complete only when a session creates editable proposals, the student explicitly curates
and saves them, owned artifacts persist in the correct products, cards return on a valid spaced
schedule, privacy/portability rules hold, and frontend/backend/dashboard evidence is manually
reconciled.

## Final response contract

Return scope, domain/scheduler design, migrations/storage/env, clickable files, automated and quality
results, browser checks performed, comprehensive manual dashboard runbook, evidence, limitations,
Stage 8 prerequisites, and `Stage 7 complete` or `Stage 7 not complete`.

