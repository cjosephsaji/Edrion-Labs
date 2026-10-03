import { describe, expect, it } from 'vitest';
import {
  activeObjectiveEvidence,
  buildObjectiveEvidenceProjection,
} from './petros-objective-evidence.service';
import type { PetrosObjectiveEvidenceRepository } from './petros-objective-evidence.repository';

type EvidenceRow = Awaited<ReturnType<PetrosObjectiveEvidenceRepository['list']>>[number];

const scope = {
  institutionId: '10000000-0000-4000-8000-000000000001',
  studentId: '20000000-0000-4000-8000-000000000001',
};
const objective = { id: '10000000-0000-4000-8000-000000000005', version: 1 };

function row(id: string, eligible: boolean, correctsEventId: string | null = null) {
  return {
    id,
    occurredAt: new Date(`2026-09-24T00:00:0${id.at(-1)}.000Z`),
    correctsEventId,
    correctionReason: correctsEventId ? 'Corrected from a new canonical evaluation.' : null,
    evidence: { response: { identityHash: id.replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
      contentHash: id.replaceAll('-', '').padEnd(64, 'b').slice(0, 64) } },
    classification: { observation: eligible ? 'petros_unassisted' : 'assisted',
      projectionEligible: eligible },
  } as unknown as EvidenceRow;
}

describe('objective evidence projection', () => {
  it('removes a superseded event and admits only active eligible events', () => {
    const first = '30000000-0000-4000-8000-000000000001';
    const rows = [
      row(first, true),
      row('30000000-0000-4000-8000-000000000002', false),
      row('30000000-0000-4000-8000-000000000003', true, first),
    ];
    expect(activeObjectiveEvidence(rows).map((item) => item.id)).toEqual([
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
    ]);
    expect(buildObjectiveEvidenceProjection(scope, objective, rows)).toMatchObject({
      activeEventCount: 2,
      eligibleEventCount: 1,
      latestEventId: '30000000-0000-4000-8000-000000000003',
    });
  });

  it('produces the same hash on a repeated rebuild and does not expose mastery', () => {
    const rows = [row('30000000-0000-4000-8000-000000000001', true)];
    const left = buildObjectiveEvidenceProjection(scope, objective, rows);
    const right = buildObjectiveEvidenceProjection(scope, objective, structuredClone(rows));
    expect(left).toEqual(right);
    expect(left).not.toHaveProperty('mastery');
    expect(left).not.toHaveProperty('score');
  });
});
