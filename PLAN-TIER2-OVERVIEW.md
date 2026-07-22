# Tier 2 Execution Overview

## 1. Outcome and scope

Tier 2 ships four differentiators on the Tier 0/1 foundations: a shared graph pipeline, independent-first adaptive Edrion Learn, one document/issuance engine with report cards, and complete mock exams. These plans are implementation instructions, not feature code. The codebase remains authoritative about existing names/shapes; each hyperspec remains authoritative about new behavior after the explicit amendments in its plan.

Plan set:

- `PLAN-GRAPH-JSON-CONTRACT.md` — frozen cross-tier wire/storage contract.
- `PLAN-GRAPH-PIPELINE.md`
- `PLAN-EDRION-LEARN.md`
- `PLAN-DOCUMENTS.md`
- `PLAN-MOCK-EXAMS.md`
- This execution/decision overview.

## 2. Build and merge order

```text
Tier 0/1 merged and recorded
        │
        ▼
Graph migration + frozen CanvasGraph v1 + runner + pipeline
        │ hard merge gate
        ▼
Edrion Learn P1 (independent first, including 180-session eval gate)
        │
        ├───────────────┐
        ▼               ▼
Documents base      Mock blueprints/banks
   → report cards     → wizard/players/results
        └───────────────┘
                parallel-safe
```

### Recommended mainline order

1. **Graph Pipeline.** Merge migration `0095` first, then frozen schema/runner/gateway/generation/layout/UI. It owns `CanvasGraph`; delaying the contract lets Edrion Learn or Tier 3 create a second dialect.
2. **Edrion Learn.** Start only after Graph is merged and `PLAN-GRAPH-JSON-CONTRACT.md` is marked frozen. Merge `0096` first. P1 ships to independent users with the real permissive policy seam and its required 180-session regression gate; P2/P3 can follow behind flags.
3. **Documents.** Merge base migration `0097` then templates/render/vault/verify/request/batches; report cards begin only after the base and shared term aggregate extraction are ready.
4. **Mock Exams.** Merge migration `0098`, then blueprint/bank work before the wizard/player/results.

Documents and Mock Exams have no direct data dependency and can run in parallel once shared Tier 1 changes are merged. If only one execution lane is available, do Documents then Mock as listed. Parallel branches must reserve migration numbers centrally and rebase the journal before merge; never allow both to claim the same index. The numeric names above assume `0094_library_fsrs` remains the latest applied migration when execution begins; if it changes, shift all unmerged Tier 2 numbers while preserving relative order.

### Merge discipline within every feature

1. Migration/schema PR, deployed/applied first.
2. API/service/worker PRs behind flags.
3. UI PRs using stable API/schema.
4. Integration/backfill/operational hardening.
5. Acceptance suite and feature-specific `IMPLEMENTED-*.md` closeout.

Every phase must be independently testable and safe with the feature flag off. A clean rebuild authorizes removal of old Edrion Learn teaching code only after replacement parity in the same merge sequence; it never authorizes table/data deletion.

## 3. Shared contract registry

### 3.1 Identity, tenancy, and feature visibility

- Institutional personal rows use `institution_id + student_id`; independent rows use `independent_user_id` and no institution/student. Institution-owned rows use institution-only where the owning table permits it. Do not import hyperspec `owner_kind/user_id` into these existing schemas.
- Institutional queries run in `runInInstitutionTenant`; independent repositories always add owner predicates. Public document verify is a narrow projection, not broad tenant bypass.
- Student visibility keys are `student.surface.*`; feature capabilities add names such as `lab.canvas.enabled`, `learn.orchestrator`, and `lab.mock_exams.visibility`. No new `student.module.*` keys.

### 3.2 Graph JSON and visual artifacts

- Owner: Graph Pipeline. Contract: `PLAN-GRAPH-JSON-CONTRACT.md` and the one exported schema in `packages/schemas/src/student/visuals.ts`.
- Exact archetypes: `mind_map|flowchart|cycle|timeline|hierarchy|comparison`, parity-asserted against PostgreSQL CHECK.
- Edrion Learn calls `generateForSession` with <=20 nodes; Debate uses the reserved two-group `clash` comparison contract <=40 nodes. Neither defines a graph DTO.
- All edits go through the central append-only revision gateway. Layout is deterministic through Node-safe `packages/canvas-layout`.

### 3.3 Petros vs Edrion Learn

- Petros is chat/answers. Edrion Learn is teaching/sessions. They share explicit entry/handoff ports, AI provider/logging, and artifacts—not product identity or teaching code.
- Old teaching prompts/controllers/renderers are deleted exactly per `PLAN-EDRION-LEARN.md`; Petros quick/ask code is retained or split at ambiguous boundaries.

### 3.4 Policy and AI-call governance

- Extend `packages/copilot`/`ai_policies` with `student_tutor` domain config; preserve existing owner-layer precedence/caps/kill switches. No Learn policy table/engine.
- Session start and every plan cycle resolve policy from P1. Global permissive default serves independent users; P3 only adds institution configuration/projections.
- All graph/Learn/mock calls use existing AI provider/budgets and `learn_ai_calls`, extended with context/flags. No per-feature cost ledger.

### 3.5 Learning evidence, mastery, and artifacts

- `learn_attempts` keeps `input/evaluation/hints_used` and existing `block_id`; `evidence_tags.polarity` remains compatible.
- Edrion Learn mastery writes are transactionally paired with replayable learner-model and strict `learning_events` entries. Mock objective evidence uses the same compatible paths/idempotency.
- Flashcards always go through Library curation and existing deck/flashcard/FSRS tables. Canvases always go through Graph Pipeline. Neither Learn nor Mock owns artifact storage.

### 3.6 Today obligations

- One `Obligation` contract in `packages/schemas/src/obligations.ts` and one merge in `TodayService`.
- Independent Edrion Learn goal/path synthesizes stable `study_block` signals; scheduled Mock creates/completes `kind='mock'`. Do not create feature feed tables.
- Learn P1 sends no push and may create at most one real-signal Today nudge/day. Mock uses state-change notifications only.

### 3.7 Request, fees, document rendering, and vault

- One registry type `document_request`; dynamic catalog policy resolves subtype/fee/template/routing server-side.
- Preserve central UUID idempotency and existing paid-request flow: draft + invoice/items, submit/route/SLA on payment confirmation, 72-hour abandonment.
- One Handlebars `document_templates`, one Playwright `document_renders`/`documents.render` queue for previews, request docs, batch docs, signatures, report cards, and reissues.
- One evolved dual-owner `student_document_vault`; no `vault_documents`. One dedicated versioned HMAC signer/public projection.
- Report-card `review` applies only to batch kind report_card; all other document kinds keep base state flow.

### 3.8 Marks and grading

- Real release entity is `mark_release_batches`, paired with `grade_entries.published`; report snapshots bind both.
- Reuse `grading_schemes`, versions, weight maps, and `student_term_results`.
- Extract one pure `computeTermAggregate` from Results recompute and import it for report-card GPA/standing. Mock question scoring is separate pure exam math; any future GPA projection must use the shared aggregate.

### 3.9 Mock blueprint, bank, player, and privacy

- Reuse `exam_paper_patterns`, `exam_blueprints.blueprint` + `version`, `question_bank`, `question_exposure`, and mock tables. Snapshot every resolved blueprint onto the mock before generation/player/scoring.
- Blueprints/banks land before student wizard/player. New AI/import bank items are pending; explicit teacher approval required.
- NTA skin lives as a frozen, screenshot-tested component/contract under `components/mock-exams/nta-reference`; Tier 3 imports it without forking.
- Voluntary scores and strict tab-switch counts are never staff-readable. Aggregates default off, enforce cohort threshold, and keep individual visibility false.

## 4. Cross-plan decisions to record in root `DECISIONS.md`

The repository already has root `DECISIONS.md`. Execution owners should add one dated decision record per item below before or with the first implementing PR, including status, rationale, affected contracts, and reversal trigger.

1. **D-T2-001 — Deployed CanvasGraph vocabulary wins.** Keep `graph_schema_version`, actual node/edge fields, underscore archetypes; optional v1 group/pin/date/color additions and reserved clash.
2. **D-T2-002 — Graph origin mapping.** Lab=`prompt/learn_topic`, Library=`library_source`, Edrion Learn=`learn_session`, retain memory/legacy, add debate_clash only.
3. **D-T2-003 — Graph layout/revision policy.** Node-safe shared layout; 409 optimistic conflict; append committed states; 200 ordinary revision cap with anchors; soft delete.
4. **D-T2-004 — Edrion Learn product split/clean rebuild.** Petros answers, Edrion Learn teaches; exact delete/retain/boundary lists.
5. **D-T2-005 — Repository owner convention overrides hyperspec owner_kind.** Apply to new Learn profiles/mastery, vault/renders, blueprints/banks.
6. **D-T2-006 — Student-tutor as policy domain.** Extend existing resolver/table with typed domain config and permissive global default; no fork.
7. **D-T2-007 — Learn launch constraints.** Independent first, no P1 pushes, mastery no decay, deterministic handoff, move cap 14/default 15m, full 180-session gate.
8. **D-T2-008 — Self-declared goal location.** Version `learning_paths.goal`; it drives independent Today plan. No goals table.
9. **D-T2-009 — One document vault and renderer.** Evolve `student_document_vault`; all PDFs through `document_renders`; preview never files.
10. **D-T2-010 — Document verify/privacy.** Dedicated signer/secret, initials default with audited full-name setting, constant 404, future-download-only revoke watermark.
11. **D-T2-011 — One document request/catalog and deployed fee flow.** Dynamic catalog adapter; paid requests remain draft until confirmation; rejection flags Fees work rather than auto-refund.
12. **D-T2-012 — Report review/correction.** Per-section review with per-card flags; regeneration invalidates only affected signatures; reissue reason internal.
13. **D-T2-013 — Released-results snapshot.** `mark_release_batches` + published entry IDs; extracted shared term aggregate is the only GPA implementation.
14. **D-T2-014 — Mock blueprint snapshot and bank approval.** Existing blueprint version; immutable mock snapshot; new AI/import bank items pending.
15. **D-T2-015 — Mock generation/player contract.** No placeholders; >=60% shortfall can shrink; timer never pauses; 120-second answer grace.
16. **D-T2-016 — Subjective score authority.** Self grade is final; AI is revealed comparator only; on-paper has no AI pass.
17. **D-T2-017 — Frozen NTA skin/privacy.** Pixel references and exact controls are Tier 3 contract; voluntary individual scores false, psychometrics n=30/no auto-reclass.
18. **D-T2-018 — Past mistakes projection.** Derive from mock answer evaluations + compatible learning evidence unless a separate mutable notebook is explicitly approved.

## 5. Human-decision items and recommendations

These are the remaining points where execution should not guess. Items marked “accept” already have a strong plan recommendation but deserve founder/architecture sign-off because the hyperspec flagged them or the repo boundary is ambiguous.

### 5.1 Graph Pipeline

| Decision | Recommendation |
|---|---|
| Origin CHECK mapping (Graph §K.1) | Accept audited mapping; only forward-add `debate_clash`. |
| Isomorphic layout (K.2) | Accept Node-safe `packages/canvas-layout`; no DOM dependencies. |
| Study mode emits no `learn_attempts` (K.3) | Accept for v1; self-check is too noisy for mastery. |
| Shared canvases are revision snapshots (K.4) | Accept and bind to Library share mechanism. Exact share-scope table/API remains implementation-time binding because current Library closeout does not expose a confirmed canvas-share table. Do not invent one. |
| Learn 8-second sync wait (K.5) | Accept; monitor p95 and tune timeout, keep typed/background contract. |
| Reserve clash edge/stub (K.6) | Accept. Reserve enum/method/fixture only. |
| Debate canvas top-level source FK | Defer exact FK until the real Tier 3 round entity exists; do not create a speculative debate table. Decide whether a validated `source_meta` bridge is acceptable before `0095` freezes. |

### 5.2 Edrion Learn

| Decision | Recommendation |
|---|---|
| `ask.*`/AskPetros shared boundary | Keep Petros Q&A; extract a narrow handoff/artifact port. |
| `router.service.ts` mixed boundary | Petros owns chat/session intent; Edrion Learn owns pedagogy. Split rather than delete. |
| Learn landing page mixed composer | Make `/learn` Edrion Learn home; move Quick Answer into Petros assistant. |
| Path/revision/history services | Retain durable responsibilities; adapt session-start/product labels. |
| “Why this?” P1 | Accept. |
| No P1 pushes | Accept; first review lever only if activation data is weak. |
| No mastery decay | Accept; revisit using measured long-idle quality. |
| Deterministic handoff | Accept for testable P1. |
| 14 moves/15 minutes | Accept as config defaults; eval/cost data triggers change. |
| Policy schema extension | Accept domain+typed config because current capability enum cannot represent string-valued tutor controls. Architecture owner should approve migration shape before P1.2. |

### 5.3 Documents and Report Cards

| Decision | Recommendation |
|---|---|
| Full-name verify setting (Documents §8.1) | Accept default off, permission/audit protected. |
| One polymorphic vault (§8.2) | Accept existing `student_document_vault` evolution; split RLS/indexes. |
| Post-payment rejection (§8.3) | Accept flag-and-Fees-desk, no auto-refund. |
| One request type/catalog (§8.4) | Accept dynamic policy adapter in Request Engine. |
| Revoked PDF limitation (§8.5) | Accept and disclose explicitly. |
| Send-back physical deletion vs audit | Recommend tombstone/abandon plus zero student projection rather than irreversible delete; founder/security should confirm this amendment. |
| Report per-section review (Report §6.1) | Accept. |
| Selective signature invalidation (§6.2) | Accept affected-card-only. |
| Internal reissue reason (§6.3) | Accept neutral student “Updated”. |

### 5.4 Mock Exams

| Decision | Recommendation |
|---|---|
| Subjective self-authority (Part B §7.1) | Accept. |
| 60% shortfall (§7.2) | Accept exactly; no placeholders. |
| Timer never pauses (§7.3) | Accept, including Quick; migrate old paused attempts safely. |
| Psychometrics n=30/no auto reclassification (§7.4) | Accept. |
| Individual voluntary scores hard false (§7.5) | Accept. Future assigned mocks require a separate contract. |
| Wrong-answer/error substrate absent | Accept derived projection. If product needs editable mistake notes/status, approve a versioned projection/cache design explicitly rather than quietly adding a table. |
| Independent AI-generated bank ownership | Recommendation: use question snapshot for current mock and do not add it to shared selectable bank without a reviewed global/private-bank ownership design. |
| `exam_profile_id` FK target | Add FK only if Tier 3’s actual `exam_profiles` table exists when migration executes; otherwise reserve a validated nullable profile key and migrate to FK with Tier 3. |
| NTA reference source | Product/design must supply or approve the canonical live NTA screenshots and exact hex samples checked into `nta-reference` before visual implementation is accepted. |

## 6. Cross-feature integration gates

### Gate G1 — Graph before Learn

- Frozen contract committed and parity test green.
- Revision/generation method usable by Edrion Learn with <=20-node fixture.
- Migration runner and timeout/background behavior tested.

### Gate G2 — Learn P1 release

- Old teaching code removed, Petros chat intact.
- Independent goal→Today and Library document→session E2E green.
- Policy start/every-plan spies, atomic evidence, SSE recovery, move/time caps green.
- Full 180-session baseline meets every threshold; prompt/model path filter enforced.

### Gate G3 — Documents base before report cards

- Templates/merge resolver/preview/render/vault/signer/batches operational.
- Request/payment fulfilment and register proven.
- Shared `computeTermAggregate` extracted and Results fixtures unchanged.

### Gate G4 — Mock model before player

- Blueprint compatibility/system seed/publish/snapshot green.
- Bank import/review/approved selector/provenance green.
- NTA reference assets approved before skin implementation.

### Gate G5 — Tier 3 readiness

- Debate: graph groups/clash schema and method signature stable.
- Entrance Prep: NTA component/screenshot contract and exam-profile blueprint hook stable.
- All closeout records list versions, exact imports/endpoints, privacy/ownership, and deviations.

## 7. Global risks and controls

| Risk | Program control |
|---|---|
| Dirty Tier 1 work/migrations are overwritten | Rebase after Tier 1 closeouts; preserve unrelated changes; reserve migrations centrally. |
| Hyperspec conceptual names create shadow tables | Schema ownership checklist in every PR; amendments name real tables/services. |
| Independent path becomes an afterthought | Independent owner fixtures/RLS/E2E in migration and first release gates. |
| AI cost/latency expands unnoticed | Shared call log/budgets, bounded contexts/retries, Learn eval gate, queue dashboards. |
| Cross-module writes are partially committed | Transaction-aware owning-service ports and stable idempotency keys. |
| Institution sees private Learn/Mock data | P1 owner-only; typed P3 visibility; aggregates thresholded/no individual voluntary scores. |
| Frozen Tier 3 contract drifts | Contract files/assets, direct imports, parity/visual tests, decision record for breaking change. |
| Feature kill routes to obsolete code | Calm unavailable/degraded behavior; no deleted-engine fallback. |

## 8. Program closeout

Each feature writes a dedicated implementation record (recommended names: `IMPLEMENTED-GRAPH-PIPELINE.md`, `IMPLEMENTED-EDRION-LEARN.md`, `IMPLEMENTED-DOCUMENTS.md`, `IMPLEMENTED-MOCK-EXAMS.md`) or an equally explicit root section if repository convention changes. Each record must include:

- Migration numbers and backfill/rollback/operations status.
- Built phases and flags/permissions/terminology.
- Exact existing substrates extended and confirmation that no shadow store/engine was created.
- Deviations/spec amendments and linked DECISIONS entries.
- Public/internal endpoints, schemas, events, method signatures, owner/privacy rules, idempotency semantics.
- Test/eval/visual/load/security evidence and reproducible commands.
- Queue/job names, alerts, retry/GC/secret-rotation runbooks.
- Contracts exposed to Tier 3 and breaking-change/version policy.

Tier 2 is complete only when every numbered hyperspec acceptance criterion is mapped to evidence or an explicit accepted deviation, all human decisions above are recorded, and the closeout records are merged.

