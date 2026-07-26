# Tier 2 Plan — Documents, Issuance, and Report Cards

## 1. Feature summary

This feature completes the institution document lifecycle: code-defined merge data, Handlebars templates, Playwright PDF renders, request fulfilment, signatures, batches, vault delivery, and public verification. Report cards are a consumer of that base engine and Tier 1 Marks; they add a mandatory class-teacher review stage and single-card reissue without creating a renderer or marks model. Every PDF producer fans into the existing `document_renders` queue and every delivered artifact lands in the evolved `student_document_vault`.

## 2. Spec Amendments and resolved audit flags

### 2.1 Existing substrate verified

- `document_templates` and `document_renders` are defined in `packages/database/src/schema/doc-gen.ts`. Templates already use `engine='handlebars'`, `html`, `css`, `fields_schema`, `header_config`, `applies_to_types`, defaults and sign-off fields. Renders already queue through `apps/api/src/modules/documents/document-render.processor.ts`, use Handlebars + Playwright + `AttachmentStorageService`, and run job `documents.render` on the reports queue. Extend these; no bespoke renderer.
- Template’s existing discriminator is `doc_type`, not `family`. Keep it for compatibility and map it to the new family/catalog vocabulary via typed schema/service fields. Do not add a second template table.
- `document_renders.institution_id` is currently required and the table lacks batch/purpose/provenance fields. Make it dual-owner/additive so individual-tier documents and previews can use the same queue.
- `document_batches`, `document_batch_items`, `report_card_reviews`, and a document catalog do not exist. They are genuine additions.
- The delivered-document table already exists as `student_document_vault` in `packages/database/src/schema/requests.ts`/migration `0085_request_engine`. It is institution-student-only and linked to a unique render. Do **not** create hyperspec `vault_documents`; evolve `student_document_vault` in place and keep one API.
- `RequestDocumentService` already creates one render per approved request, files a vault row, supports sign/deliver/send-back/revoke, and exposes public `/documents/verify/:code`. Refactor it into the base orchestration rather than replacing it.
- A private HMAC code helper already exists in `request-document.service.ts` using `hmacSha256Base64Url` and the session secret. The hyperspec’s “no signer” claim is only partly true: there is no dedicated signer/secret/alphabet contract. Extract a dedicated signer and maintain a legacy-verification transition.
- Tier 0 Request Engine owns a single `document_request` type today with bonafide/transcript payload options and static `requiresPayment=false`. The central idempotency contract is required UUID header, Redis replay 24 hours plus durable `idempotency_keys`, completed replay 200, in-flight 409.
- Fee-linked request semantics in the deployed engine differ from Documents §3.2: the engine creates `student_requests.status='draft'` plus `fee_invoices` and `fee_invoice_items` atomically, then submits/routes only after payment confirmation. Preserve this proven flow. SLA starts on confirmation; do not create a submitted-but-hidden parallel state.
- Existing vault verification projection has issuer/initials/type/date/status but not the exact constant-shape/rate/timing/full-name contract. Extend it.
- Template CRUD is implemented by `DocumentsGenService`, not `PortalCrudEngine`. Continue through the owning service; “extend never fork” does not require moving a non-flat editor into an unrelated engine.

### 2.2 Marks/report-card corrections

- Tier 1’s real release table is `mark_release_batches`, not `mark_releases`. `grade_entries.published` remains authoritative. Report-card population must bind released entry IDs from `mark_release_batches.entry_ids` and reject any unpublished/unreleased entry.
- `grading_schemes`, scheme versions, `subject_weight_maps`, and `student_term_results` exist. Pure standing/needed functions are in `packages/schemas/src/grading`, but term GPA aggregation is still local to `apps/api/src/modules/portal/results-recompute.service.ts`. Extract a pure shared `computeTermAggregate` before report-card merge resolution. Report cards and any GPA display import it; no copied GPA math.
- `report_cards` in the institutional bridge is a legacy uploaded-PDF table. Leave it untouched; do not dual-write or reuse it as the new issuance register.
- A batch pins release IDs, grading/scheme versions, aggregate inputs/results, merge data, and template fingerprint at generation. A later mark release cannot change an in-review batch.

### 2.3 Strategic calls resolved

Documents §8:

1. `verify_show_full_name`: accept default-off institution setting. Verification returns initials unless explicitly enabled; changing it is audited and permissioned.
2. Dual-owner vault: accept one evolved `student_document_vault` with split CHECK/RLS/partial indexes. It follows the repo’s owner convention, not the spec’s `owner_kind/user_id` columns.
3. Post-payment rejection: accept “flag and route to Fees desk”; no document code moves money.
4. One `document_request` plus payload union/catalog: accept. Custom subtype changes require no deploy, while request state machine remains one type.
5. Revoked PDF watermark only affects future downloads: accept and show the limitation in admin confirmation/help.

Report Cards §6:

1. Review is per-section completion with per-card flags: accept.
2. Regeneration invalidates only regenerated cards’ signatures/review, not siblings: accept.
3. Reissue reason is internal; student sees neutral “Updated {date}”: accept.

### 2.4 Behavioral reconciliation

- `student_document_vault` may point to a render or a manual-upload storage key. It gets a verify code before delivery, but preview renders never create a vault row and use a non-resolving sample code.
- “Send back” currently deletes a vault row. Preserve the user-visible invariant (no vault artifact, request back to in-review) but prefer a transactional `abandoned_at`/audit tombstone over irreversible deletion if the new provenance chain needs audit. The student projection must show no change/notification.
- Verification code is derived from a preallocated vault UUID, so the vault row/id is reserved before final render/filer. Globally unique collision handling retries with a deterministic domain separator/version; never weakens length/alphabet.
- Report-card `review` is enforced only for `document_batches.kind='report_card'`. Other kinds proceed from generating to signing/delivery under their own signature rules.

## 3. Dependencies and contracts

### Prior-tier and owning services

- Request Engine: registry in `packages/schemas/src/request-types`, `RequestEngineService`, state/events/idempotency, RequestDocumentService fulfilment link.
- Fees: invoices/items, payment-confirmation routing, 72-hour abandonment, refund workflow/desk flag.
- Marks: `mark_release_batches`, `grade_entries.published`, grading schemes/versions, weight maps, `student_term_results`, correction/release APIs.
- Rendering: `document_templates`, `document_renders`, `documents.render`, Handlebars/Playwright, `AttachmentStorageService`.
- Storage: rendered artifact storage and signed downloads; `StudentStorageService`/`storage_objects` patterns for user-owned uploads where suitable. No raw bucket keys from clients.
- Notifications/Today/audit/recent-auth/permissions/terminology from existing platform modules.

### Exposes

- One document catalog/request fulfilment contract for certificates, transcripts, receipts, hall tickets, IDs, report cards, and individual reports.
- One deterministic merge resolver/template validation/preview contract.
- One batch/item state machine and issuance register.
- One dual-owner vault/read/download API and public verify projection.
- Report-card reviewed/signed/delivered snapshots and single-card supersede chain.

## 4. Implementation phases

### Phase C1 — Base data migration and schemas (Documents §1, §5.1, §6; Report §1.3)

**Goal:** merge all base storage before any new API/UI.

**Files**

- Add `packages/database/migrations/0098_documents_issuance.sql`; modify `packages/database/src/schema/doc-gen.ts`, `requests.ts`, schema index, journal/grants/RLS.
- Add shared schemas in `packages/schemas/src/documents/{catalog,templates,merge-data,batches,vault,verify,report-cards}.ts` and exports/specs.

**Template/render extensions**

- `document_templates`: add `family text` only if `doc_type` cannot be safely normalized; preferred plan is keep `doc_type` and validate against family enum in catalog. Add `active boolean DEFAULT true`, optional `platform_template_key`, and version if absent. Evolve `fields_schema`/`header_config` JSON through versioned Zod: merge fields, letterhead, ordered signature slots (`image_stamp|sign_step`), immutable verification block position. Unknown template tokens fail before save.
- `document_renders`: make `institution_id` nullable; add `student_id` nullable, `independent_user_id` nullable, and CHECK for institutional (`institution_id+student_id`) vs independent (`independent_user_id` only) vs institution-admin preview/batch (`institution_id`, no personal owner) shapes. Add `purpose CHECK ('issuance','preview','batch','reissue','signature')`, `family`, `ref_type/ref_id`, `batch_item_id`, `template_fingerprint`, `attempt_no`, and idempotency/generation key. Keep status `queued|rendering|done|failed`, payload, artifact/storage/error, queue and processor.

**New catalog/batch tables**

- `document_catalog`: UUID, institution_id, `subtype_key`, family/doc_type, title/description, active, eligibility config, delivery modes, `template_id`, `fee_head_id`, `fee_amount_minor` integer >=0, requires_payment, SLA/routing config, required fields/payload schema version, version/timestamps. Unique `(institution_id,subtype_key)`. Platform defaults may be represented by code-defined registry entries plus institution overrides; do not create institution-null rows if existing tenancy/RLS makes them unsafe.
- `document_batches`: UUID; institution/campus; `kind` CHECK `hall_ticket|id_card|report_card|manual_upload`; template/fingerprint; versioned `scope jsonb`; status CHECK `draft|generating|review|signing|delivering|completed|completed_with_errors|cancelled`; counts jsonb; population snapshot metadata; locked_at; created_by; version/timestamps.
- `document_batch_items`: UUID; batch/student FKs; status `pending|rendering|rendered|failed|excluded|delivered`; render/vault nullable FKs; error jsonb; `merge_snapshot`, `source_snapshot`, `sign_state`, `review_flag`; version/timestamps; unique `(batch_id,student_id)`.
- `report_card_reviews`: UUID; batch/section; status `pending|reviewed|flagged`; reviewer/timestamps/version; unique `(batch_id,section_id)`.

**Evolve `student_document_vault`**

- Make institution/student nullable and add `independent_user_id`; exact CHECK: institutional document has institution+student and no independent; independent document has independent and no institution/student.
- Preserve `request_id`, but make `document_render_id` nullable/non-unique globally as needed for manual uploads; add `storage_key`, `family`, `source CHECK request|batch|manual_upload|system`, `template_id`, `template_fingerprint`, `batch_id`, `batch_item_id`, `academic_year`, `delivered_at`, `delivery_mode`, `pickup_ready_at`, `collected_at/by`, `superseded_by`, `supersedes`, `reissue_reason`, `revoked_at/reason`, `abandoned_at`, `version`, issued metadata. Exactly one artifact source (`render done` or manual storage key) is required before delivery.
- Unique verify code and partial owner/date/family indexes. Supersede FKs cannot cycle; service enforces chain and one current document.
- Split RLS/owner queries exactly by owner shape. Public verification uses a security-definer/narrow service query returning the projection only, never broad RLS bypass.

**Definition of done**

- Existing request-issued vault rows backfill without losing verification/download.
- CHECK/FK/unique/RLS tests cover institutional, independent, preview, batch, manual, and invalid mixed ownership.
- Every JSON column has a versioned Zod schema and migration fixture.

### Phase C2 — Merge resolvers, template editor API, and previews (Documents §1.2–§2)

**Goal:** make templates safe and deterministic on the one render queue.

**Files**

- Extend `apps/api/src/modules/documents/documents-gen.service.ts`, controller, renderer/processor, default templates.
- Add `document-merge-resolver.registry.ts`, family resolvers, `template-token-validator.ts`, fingerprint utility, preview fixtures, and tests.
- Institution web: templates list/editor/preview under existing settings/issuance navigation.

**Behavior/API**

- Code-defined, versioned resolvers supply only whitelisted fields: common institution/issue/verify; student; certificate/transcript; receipt lines; hall ticket; ID; report/result. Resolve through owning module services and pin the resolved payload.
- Parse the Handlebars AST on save; every field/helper path must be declared by that family’s `fields_schema`. Reject 422 `UNKNOWN_MERGE_FIELD` with all offenders. Disable prototype access/raw HTML helpers and validate CSS/asset refs.
- `GET/POST/PATCH /institution/document-templates`, customize platform default by cloning, active toggle. Require expected version/idempotency on mutation.
- `POST /institution/document-templates/:id/preview` creates a normal `document_renders` row with `purpose='preview'`, code-defined sample data, `SAMPLE-0000`, and template fingerprint. `GET /document-renders/:id` and signed preview URL expose status/output. Preview is excluded from register/vault and its QR returns the same 404 shape as unknown.
- Signature slots coexist: image stamp embeds at render; ordered sign step blocks delivery and re-renders deterministically with signer profile signature/recent-auth. Sign roles/permissions are checked per step.
- Logo/signature uploads use institution-scoped storage, MIME/signature/size validation (logo <=1MB), virus scanning where platform storage supports it, and opaque refs in config.

**UI**

- Template cards grouped by family/type, badge/default/custom, active toggle, customize/edit.
- Two-column editor: letterhead, Handlebars body + merge palette, signature slots, fixed verification block, sign-off, and debounced actual-queue preview. Preview failure is amber and does not discard edits.

**Definition of done**

- Unknown tokens, unsafe helpers, missing merge data, signature ordering, deterministic fingerprint/render, preview non-filing, sample verify 404, tenant asset isolation, and customize-default tests pass.
- No code path calls Playwright outside the existing renderer/processor.

### Phase C3 — Dedicated signer, public verify, vault, and downloads (Documents §6–§7)

**Goal:** one privacy-safe verification/vault contract across tiers.

**Files**

- Add signer beside the existing common crypto HMAC primitive, e.g. `apps/api/src/common/crypto/document-verify-signer.ts` (or shared crypto package if that is where the primitive actually resides).
- Refactor `request-document.service.ts`, `document-verification.controller.ts`; add student vault controller/service and web Vault UI.

**Signer/verify**

- Dedicated `DOCUMENT_VERIFY_SECRET`; `base32(HMAC-SHA256(secret, 'v1:'+vaultId)).slice(0,12)` using `[A-HJ-NP-Z2-9]`. Store code; global unique retry handles the theoretical collision. Never reuse cookie secret.
- Transition: new rows use v1 signer; existing codes remain lookup-verifiable and are never regenerated merely by migration. Add `verify_code_version`.
- Public `GET /documents/verify/:code`: normalize allowed input, 30/min/IP, no-index/cache policy, constant-shaped 404 for malformed/unknown/sample, and minimum/equalized work so format/existence is not timing-distinguishable within a tested tolerance.
- Projection exactly issuer name/logo, doc-type label, initials (or full name only when audited setting true), issue date, status `Valid|Revoked|Superseded`; no reason, registration number, owner ID, or PDF. QR URL uses configured verification origin.

**Vault/download**

- `GET /student/documents` cursor/family/year/month filters and `GET /:id/download`; owner check each time. Download of revoked docs renders/serves a diagonal REVOKED overlay for future fetches; old saved copies cannot be recalled. Superseded current projection hides old by default.
- Institution rows group by academic year; independent by month. Cache-read tolerant list and previously downloaded offline cache; stale badge instead of error screen.
- Verification code is minted when the preallocated vault record enters filing, before final render merge. Delivery remains null until sign/desk action.

**Definition of done**

- Exact projection contract, 404/timing/rate-limit, legacy code, initials/full-name setting, revoke <=10s, supersede, revoked download overlay, owner isolation, offline/stale list tests pass.

### Phase C4 — Request catalog, fee routing, and fulfilment (Documents §3–§4)

**Goal:** finish Tier 0 request→document without a new request state machine.

**Files**

- Extend `packages/schemas/src/request-types/document-request.ts` and registry config types.
- Refactor `request-registry.service.ts`, `request-engine.service.ts`, `request-document.service.ts`, request config API/UI, and Fees confirmation adapter.
- Add student request wizard/tracker and institution Issuance queue/register surfaces.

**Registry/catalog design**

- Keep registry key `document_request`. Payload is versioned discriminated union `{subtypeKey,deliveryMode,fields,...}` validated against a server-loaded active `document_catalog` entry.
- Add an owning Request Engine submission-policy adapter key such as `dynamicPolicy='document_catalog'`. The package registry declares the adapter; API resolves DB fee/template/routing/eligibility. Do not put DB lookups in Zod package and do not fork submission.
- Custom catalog entries are zero-deploy data but may select only supported code-defined family/resolver fields. Unknown custom merge semantics remain impossible.

**Payment/request behavior**

- Non-fee: idempotent submit enters normal submitted/routing flow and starts SLA.
- Fee: one transaction creates/replays request draft + invoice/items using existing origin/ref, returns Pay now. It is absent from registrar routing until gateway confirmation; confirmation submits/routes and computes SLA. Unpaid 72 hours uses existing abandonment/close behavior and one notification.
- Post-payment decline requires checkbox/event `refund_flagged` and routes work to Fees; it does not call refund/move money.

**Fulfilment/signing**

- Approval resolves/pins merge data and template, preallocates vault ID/code, creates one issuance render using request ID/idempotency key. Processor done files it and sets request fulfilment document ID through existing hooks.
- Ordered sign steps and desk delivery; digital delivers to vault, pickup sets ready and collected fields. Send-back requires >=10-char note, abandons undelivered vault artifact, request returns to in-review, no student event/notification.
- Register search/actions: name/reg/code/type/date, download, revoke with recent auth/reason, reissue with supersede, mark collected.

**Definition of done**

- Request idempotency/replay, catalog validation, paid/unpaid routing/SLA, confirmation race, post-payment decline flag, single render/vault, send-back invisibility, sign order, and fulfilment-link tests pass.
- Existing bonafide/transcript requests remain readable/finishable through compatibility catalog entries.

### Phase C5 — Base batches and manual uploads (Documents §5)

**Goal:** safely issue hall tickets/IDs/manual files at population scale.

**Files**

- Add `document-batch.service.ts`, controller, population resolvers, processor/event updater, storage/import parser, API schemas.
- Institution Issuance tabs Queue/Batches/Register and batch wizard/progress/retry/manual mapping UI.

**API/state**

- `POST /institution/document-batches` creates draft and immutable eligible-population item snapshot; `/preview`, `/generate`, `/cancel`, `/retry-failed`, `/sign`, `/deliver`; `GET /:id`. All mutations require idempotency and expected version/status.
- Preview first/median/last three as throwaway renders; generate remains disabled until three succeed/are explicitly acknowledged as valid.
- Generate enqueues one `document_render` per pending item. Each item mirrors its render. No batch retry loop; Retry failed creates fresh render rows only for failed items under lock. Final is completed or completed_with_errors.
- Cancel only generating: stop enqueue, let in-flight finish but never deliver; GC abandoned PDFs after 7 days.
- Hall-ticket eligibility reads owning exam/dues services. Dues-held students are excluded/held with a notice, never issued. Compute population and lock items transactionally to prevent oversell/double issue races.
- Manual uploads accept PDFs only, store quarantined/validated objects, map by `{reg_no}.pdf` or CSV `filename,reg_no`, show unmatched files and students. Delivery is blocked while unmatched files exist; matched files produce normal verify/vault rows with render null.

**Definition of done**

- Per-item failure isolation, retry concurrency, cancel/GC, dues holds, immutable population, signature/delivery counts, manual ambiguity/unmatched blocking, malware/MIME/size, and 400+ item load tests pass.

### Phase C6 — Shared term aggregate extraction and report-card snapshots (Report §1–§2)

**Goal:** prepare marks-derived merge data without leaking unreleased data.

**Files**

- Extract `computeTermAggregate` into `packages/schemas/src/grading/term-aggregate.ts`; refactor `results-recompute.service.ts` to import it and add cross-module fixtures.
- Add report-card merge resolver/payload schemas and batch population service.

**Behavior**

- Report batch scope `{termId,sectionIds[]}`. Query current released batches, verify each grade entry is `published=true` and included in a relevant `mark_release_batches.entry_ids` snapshot. Missing/unreleased results fail item/batch preview with explicit source link; never substitute draft scores.
- Snapshot per item includes release batch IDs, entry IDs/scores/max, scheme/version, subject weight map/version, remarks/attendance fields, and output from the shared pure aggregate. Template/render payload and fingerprint are immutable for that generation.
- Samples are first/median/last roster through normal preview renders and no vault rows.

**Definition of done**

- Same fixtures yield identical result GPA/grade/standing in student Results, recompute, and PDF resolver.
- Unreleased/draft and post-snapshot new-release leakage tests pass.

### Phase C7 — Report-card wizard, mandatory review, signatures, publish (Report §2–§4)

**Goal:** deliver the report-card-only review state.

**Files**

- Add report-card admin wizard, teacher review page/API, flags/resolution/regeneration, sign/publish orchestration, Today/notification adapters.

**Behavior**

- Wizard selects term/sections/template, validates merge data, previews three, generates N. Completion transitions report-card batch to review and creates one `report_card_reviews` row per section.
- Class teacher receives one push and Today item “Review {section} report cards ({N})”. Teacher can see/flag only their section. Flag note required. “Mark section reviewed” enabled only when open flags=0.
- Batch admin fixes source and “Regenerate flagged”: fresh renders only for flagged items; replace undelivered vault artifacts, clear those flags, reset only affected card/section review, and clear only those cards’ signatures. Siblings survive. Every action audited.
- Auto-advance review→signing only when every section reviewed/no flags. Ordered sign steps; re-render signed cards through existing queue. Publish/deliver locks batch; one student and one school-tier parent push per card, none during generate/review/sign.

**Definition of done**

- Cross-section 403, open-flag blockers, selective invalidation, audit, Today completion, ordered/recent-auth signing, publish lock, no premature notification, and partial-failure tests pass.
- Other batch kinds demonstrably skip review.

### Phase C8 — Single-card report reissue and closeout (Report §5)

**Goal:** correct one published card without reopening a batch.

**Behavior/API**

- Register/card action requires `reports.generate`, recent auth, and internal reason. Re-resolve current corrected released data but use batch-pinned template/family settings; create one reissue render, new vault/code, and old↔new supersede chain.
- Route only this card through the same sign slots. Final signature delivers/replaces current vault card, student gets one push and sees “Updated {date}”. Old verify is Superseded; new is Valid. Reason stays audit-only.
- Idempotency and row locks prevent two current successors/double delivery.

**Definition of done**

- Report acceptance §5 1–3 plus concurrent reissue, failed sign/render, and old/new verification/download tests pass.
- Write `IMPLEMENTED-DOCUMENTS.md` with migrations, base/report phases, exact existing substrates extended, request/fee semantics, catalog/resolver versions, signer/version transition, render/vault/batch state machines, shared aggregate extraction, decisions/deviations, operations and Tier 3 document contracts.

## 5. Risks and landmines

| Risk | Guard |
|---|---|
| Shadow vault/renderer/request type | Schema review asserts only `student_document_vault`, `document_renders`, `document_request`. |
| Unreleased marks leak | Release-entry intersection + published guard before snapshot/render; negative fixtures. |
| GPA differs across Results/PDF | One extracted pure `computeTermAggregate` and shared golden tests. |
| Fee request routed before payment | Preserve draft+invoice flow and transaction/race tests. |
| Double-credit/double fulfilment | Central idempotency, unique refs, row locks, processor idempotency. |
| Batch oversell/dues race | Snapshot/lock eligibility transaction and final pre-delivery guard. |
| Template injection/unknown data | Handlebars AST allowlist, safe runtime, resolver version, payload pin. |
| Verification leaks PII/existence | Narrow projection, initials default, constant 404/timing, rate/no-index. |
| Cookie-secret reuse/code churn | Dedicated versioned secret/signer; legacy lookup transition. |
| Send-back destroys audit | Prefer abandoned tombstone while keeping zero student projection. |
| Signature regeneration invalidates siblings | Item-scoped sign state and selective tests. |
| Manual upload maps wrong student | Exact one-to-one preview, ambiguity/unmatched block, checksum/audit. |
| Revoked downloaded copy assumed recallable | Explicit admin warning; watermark future downloads only. |
| Queue retry duplicates vault rows | Stable ref/idempotency keys and filer transaction uniqueness. |

## 6. Acceptance and closeout checklist

- Map every Documents §1–§7 and Report Cards §1–§5 acceptance item to automated evidence/manual QA; list any deviation in closeout.
- Prove all preview/issuance/signature/reissue/report renders use `documents.render`; previews create no vault/register entry.
- Prove one `document_request` registry type and deployed draft/payment-confirmation flow.
- Prove exact verify projection, code alphabet/version, owner isolation, revoked/superseded states, and one dual-owner vault API.
- Prove batch item isolation/retry/cancel/manual mapping, report-only review, selective regeneration, release snapshot, shared GPA function, ordered signing and single-card reissue.
- Closeout publishes resolver/template payload versions, downstream family/catalog contract, queue/runbook/GC/secret-rotation steps, flags/permissions/terminology, and all strategic decisions.

