import { randomUUID } from 'node:crypto';
import { sourceRevisionSchema, type SourceBinding } from '@edrion/schemas';
import { revisionPreparation } from './petros-content-intelligence.service';
import type { ExtractionEvidence } from './adapters/content-adapter';
/** Original fixture-only identity. Never connected to a deployed principal or approval. */
export function fixtureRevision(e: ExtractionEvidence) {
  const sourceId = randomUUID(),
    objectId = randomUUID(),
    userId = randomUUID();
  const binding: SourceBinding = {
    kind: 'material',
    materialId: sourceId,
    objectId,
    materialVersion: 1,
    contextKind: 'course',
    contextId: randomUUID(),
    subjectId: randomUUID(),
  };
  const p = revisionPreparation(e, binding, 'Original CC0 engineering fixture');
  return sourceRevisionSchema.parse({
    schemaVersion: 'petros.v2.source-revision.v1',
    id: randomUUID(),
    source: {
      schemaVersion: 'petros.v2.source.v1',
      id: sourceId,
      institutionId: randomUUID(),
      binding,
      kind: e.format,
      title: p.title,
      owner: { kind: 'institution_staff', userId },
      originalHash: e.originalHash,
    },
    processing: {
      extractor: p.extractor,
      interpretationVersion: p.interpretationVersion,
      schemaVersion: 'petros.v2.content.v1',
      model: null,
      promptHash: null,
      correctionOf: null,
      createdBy: userId,
    },
    representationHash: p.representationHash,
    pageCount: e.pageCount,
    slideCount: e.slideCount,
    shapeRegistry: e.shapeRegistry,
    ...(e.nativeLocators ? {nativeLocators:e.nativeLocators} : {}),
    coverage: p.coverage,
    conversion: null,
  });
}
