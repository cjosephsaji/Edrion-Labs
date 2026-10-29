# M2 file inventory

Compared with the starting 5,209-file snapshot: 5,194 unchanged; 15 changed; 0 missing. 105 new files, including evidence/logs and this inventory. No pre-existing file was deleted.

The two generated M1 evidence refresh exceptions are described in the main report. Other changed baseline files are intended M2 integration changes. This inventory includes ignored verification logs and excludes macOS AppleDouble sidecars. Hash comparisons are in `preservation-audit.json`.

## Changed baseline files

| File | Classification |
| --- | --- |
| [apps/api/src/modules/integrations/petros-m1-foundations.integration.spec.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/integrations/petros-m1-foundations.integration.spec.ts>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/integrations/petros-phase2-test-database.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/integrations/petros-phase2-test-database.ts>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/student/knowledge/knowledge-document.module.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/knowledge-document.module.ts>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/student/knowledge/knowledge-pdf-process.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/knowledge-pdf-process.ts>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/student/knowledge/knowledge-preparation.repository.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/knowledge-preparation.repository.ts>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/student/knowledge/pdf-extract.cjs](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/pdf-extract.cjs>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/student/knowledge/petros-content-unit.repository.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-unit.repository.ts>) | M2 implementation / contract / integration test change |
| [apps/api/src/modules/student/materials/presentation-converter.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/materials/presentation-converter.ts>) | M2 implementation / contract / integration test change |
| [docs/verification/petros-v2/m1-evidence/repository-query-behavior.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m1-evidence/repository-query-behavior.json>) | Historical generated evidence refreshed by M1 harness |
| [docs/verification/petros-v2/m1-evidence/source-identity-demo.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m1-evidence/source-identity-demo.json>) | Historical generated evidence refreshed by M1 harness |
| [packages/config/src/index.ts](</Volumes/Chris/Edrion Labs/packages/config/src/index.ts>) | M2 implementation / contract / integration test change |
| [packages/database/migrations/meta/_journal.json](</Volumes/Chris/Edrion Labs/packages/database/migrations/meta/_journal.json>) | M2 implementation / contract / integration test change |
| [packages/database/src/client.ts](</Volumes/Chris/Edrion Labs/packages/database/src/client.ts>) | M2 implementation / contract / integration test change |
| [packages/database/src/schema/student-knowledge.ts](</Volumes/Chris/Edrion Labs/packages/database/src/schema/student-knowledge.ts>) | M2 implementation / contract / integration test change |
| [packages/schemas/src/petros-v2/content.ts](</Volumes/Chris/Edrion Labs/packages/schemas/src/petros-v2/content.ts>) | M2 implementation / contract / integration test change |

## New files

| File | Classification |
| --- | --- |
| [apps/api/scripts/benchmark-petros-m2.mjs](</Volumes/Chris/Edrion Labs/apps/api/scripts/benchmark-petros-m2.mjs>) | M2 implementation / isolated tooling |
| [apps/api/scripts/benchmark-petros-m2.ts](</Volumes/Chris/Edrion Labs/apps/api/scripts/benchmark-petros-m2.ts>) | M2 implementation / isolated tooling |
| [apps/api/scripts/inspect-petros-m2.mjs](</Volumes/Chris/Edrion Labs/apps/api/scripts/inspect-petros-m2.mjs>) | M2 implementation / isolated tooling |
| [apps/api/scripts/inspect-petros-m2.ts](</Volumes/Chris/Edrion Labs/apps/api/scripts/inspect-petros-m2.ts>) | M2 implementation / isolated tooling |
| [apps/api/scripts/petros-m2-inspector.html](</Volumes/Chris/Edrion Labs/apps/api/scripts/petros-m2-inspector.html>) | M2 implementation / isolated tooling |
| [apps/api/scripts/verify-petros-m2.mjs](</Volumes/Chris/Edrion Labs/apps/api/scripts/verify-petros-m2.mjs>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/integrations/petros-m2-document-understanding.integration.spec.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/integrations/petros-m2-document-understanding.integration.spec.ts>) | Isolated verification code |
| [apps/api/src/modules/student/knowledge/adapters/content-adapter.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/adapters/content-adapter.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/adapters/m2-crop.cjs](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/adapters/m2-crop.cjs>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/adapters/m2-native.cjs](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/adapters/m2-native.cjs>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/adapters/pdf-content.adapter.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/adapters/pdf-content.adapter.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/adapters/pptx-content.adapter.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/adapters/pptx-content.adapter.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/petros-content-edge-cases.spec.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-edge-cases.spec.ts>) | Isolated verification code |
| [apps/api/src/modules/student/knowledge/petros-content-intelligence.jobs.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-intelligence.jobs.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/petros-content-intelligence.service.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-intelligence.service.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/petros-content-intelligence.spec.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-intelligence.spec.ts>) | Isolated verification code |
| [apps/api/src/modules/student/knowledge/petros-content-interpretation.spec.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-interpretation.spec.ts>) | Isolated verification code |
| [apps/api/src/modules/student/knowledge/petros-content-interpretation.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-interpretation.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/petros-content-ocr.spec.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-ocr.spec.ts>) | Isolated verification code |
| [apps/api/src/modules/student/knowledge/petros-content-ocr.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-content-ocr.ts>) | M2 implementation / isolated tooling |
| [apps/api/src/modules/student/knowledge/petros-m2-controlled-gateway.fixture.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-m2-controlled-gateway.fixture.ts>) | Isolated verification code |
| [apps/api/src/modules/student/knowledge/petros-m2-test-helpers.ts](</Volumes/Chris/Edrion Labs/apps/api/src/modules/student/knowledge/petros-m2-test-helpers.ts>) | Isolated verification code |
| [docs/verification/petros-v2/m2-document-understanding.md](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2-document-understanding.md>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/browser-qa.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/browser-qa.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/build.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/build.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/built-adapter-smoke.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/built-adapter-smoke.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/built-adapter-smoke.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/built-adapter-smoke.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/database-evidence.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/database-evidence.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/database-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/database-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/database-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/database-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/diagnostic-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/diagnostic-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/edge-case-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/edge-case-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/edge-case-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/edge-case-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/evaluation.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/evaluation.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/execution-plan.md](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/execution-plan.md>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/file-inventory.md](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/file-inventory.md>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/format-adapters.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/format-adapters.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/format-final.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/format-final.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/format-inspector.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/format-inspector.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/format.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/format.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/frontend-regression-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/frontend-regression-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/frontend-regression-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/frontend-regression-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/inspector-http-checks.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/inspector-http-checks.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/inspector-lint.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/inspector-lint.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/inspector-refresh.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/inspector-refresh.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/inspector.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/inspector.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/lint.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/lint.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/m1-regression-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/m1-regression-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/m1-regression-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/m1-regression-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/native-and-model-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/native-and-model-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/native-and-model-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/native-and-model-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/ocr-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/ocr-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/ocr-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/ocr-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/performance.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/performance.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/performance.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/performance.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/preservation-audit.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/preservation-audit.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/runs.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/runs.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/schema-regression-tests.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/schema-regression-tests.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/schema-regression-tests.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/schema-regression-tests.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/cloud-reversed-arrow.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/cloud-reversed-arrow.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/cloud-revised-cell.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/cloud-revised-cell.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/cloud-table.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/cloud-table.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/corrupt-blocked.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/corrupt-blocked.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/english-evidence.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/english-evidence.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/image-only-uncertainty.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/image-only-uncertainty.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/narrow-inspector.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/narrow-inspector.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/screenshots/ocr-crop-receipt.jpg](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/screenshots/ocr-crop-receipt.jpg>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/starting-hashes.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/starting-hashes.json>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/starting-status.txt](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/starting-status.txt>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/typecheck.log](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/typecheck.log>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/verification-commands.md](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/verification-commands.md>) | Verification evidence / documentation / screenshot |
| [docs/verification/petros-v2/m2/verification-manifest.json](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m2/verification-manifest.json>) | Verification evidence / documentation / screenshot |
| [packages/database/migrations/0236_petros_m2_preparation_progress.sql](</Volumes/Chris/Edrion Labs/packages/database/migrations/0236_petros_m2_preparation_progress.sql>) | PROPOSED migration; no configured target applied |
| [packages/learn-evals/src/petros-v2/fixtures/argument-analysis.ts](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/argument-analysis.ts>) | Provisional gold labels / source generator / hash manifest |
| [packages/learn-evals/src/petros-v2/fixtures/cloud-computing.ts](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/cloud-computing.ts>) | Provisional gold labels / source generator / hash manifest |
| [packages/learn-evals/src/petros-v2/fixtures/generate-edge-sources.py](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/generate-edge-sources.py>) | Provisional gold labels / source generator / hash manifest |
| [packages/learn-evals/src/petros-v2/fixtures/generate-sources.py](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/generate-sources.py>) | Provisional gold labels / source generator / hash manifest |
| [packages/learn-evals/src/petros-v2/fixtures/manifest.ts](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/manifest.ts>) | Provisional gold labels / source generator / hash manifest |
| [packages/learn-evals/src/petros-v2/fixtures/source-manifest.json](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/source-manifest.json>) | Provisional gold labels / source generator / hash manifest |
| [packages/learn-evals/src/petros-v2/fixtures/sources/ambiguous-arrow.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/ambiguous-arrow.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/argument-commentary.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/argument-commentary.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/argument-revised.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/argument-revised.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/argument.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/argument.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/cloud-models-revised.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/cloud-models-revised.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/cloud-models.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/cloud-models.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/cloud-reference.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/cloud-reference.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/corrupt.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/corrupt.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/embedded-executable.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/embedded-executable.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/encrypted.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/encrypted.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/external-link.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/external-link.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/grouped-shapes.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/grouped-shapes.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/hidden-slide.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/hidden-slide.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/huge-dimensions.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/huge-dimensions.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/image-only.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/image-only.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/injection.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/injection.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/legacy-blocked.ppt](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/legacy-blocked.ppt>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/macro.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/macro.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/malformed.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/malformed.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/oversized-pages.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/oversized-pages.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/rotated.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/rotated.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/smartart.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/smartart.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/structures.pdf](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/structures.pdf>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/unsafe-path.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/unsafe-path.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/xml-entity.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/xml-entity.pptx>) | Actual original fixture bytes / structural rejection probe |
| [packages/learn-evals/src/petros-v2/fixtures/sources/zip-bomb.pptx](</Volumes/Chris/Edrion Labs/packages/learn-evals/src/petros-v2/fixtures/sources/zip-bomb.pptx>) | Actual original fixture bytes / structural rejection probe |
