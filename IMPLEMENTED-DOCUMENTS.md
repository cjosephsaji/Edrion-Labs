# Documents & Issuance — Implementation Record

Execution against `PLAN-DOCUMENTS.md` (Tier 2).

## Tier 3 program gate

| Check | Status |
|---|---|
| Campus Bundle A (ID templates) | **YES** |
| Plan acceptance C1–C8 | **YES — Tier 2 Documents closed** |

## Migration

`0098_documents_issuance.sql` (journal idx 98).

## Phases

| Phase | Status |
|---|---|
| C1 | Done — catalog, batches, vault extensions, Drizzle |
| C2 | Done — template API via `DocumentsGenService` + issuance previews |
| C3 | Done — `document-verify-signer`, public verify, vault delivery |
| C4 | Done — request fulfilment + catalog adapter |
| C5 | Done — batch create/generate API |
| C6 | Done — `computeTermAggregate` in `@edrion/schemas` |
| C7 | Done — report-card batch + `report_card_reviews` seed on create |
| C8 | Done — `POST …/report-cards/reissue` |

## API

`portal/documents/issuance/*` — catalog, batches, generate lock, reissue.

## Schemas

`packages/schemas/src/documents/*`
