import { createHash } from 'node:crypto';
import { canonicalContent } from '@edrion/schemas';
export const BELIEF_ALGORITHM = 'petros.categorical.v1';
export type BeliefEvent = {
  id: string;
  corrects: string | null;
  criterionId: string;
  status: string;
  eligible: boolean;
  family: string;
  role: 'concept' | 'method' | 'explanation' | 'application';
  category: string;
  distinguishes: boolean;
  occurredAt: string;
  evaluationValid: boolean;
  assisted: boolean;
  repeated: boolean;
  retentionCheck: boolean;
};
/** Reproducible projection, never an academic mark or a percentage. The repository supplies DB timestamps. */
export function reduceConceptBelief(
  events: BeliefEvent[],
  requiredCriteria: string[],
  now: string,
  graphVersion: string,
) {
  if (
    !Number.isFinite(Date.parse(now)) ||
    !graphVersion ||
    new Set(events.map((e) => `${e.id}:${e.criterionId}`)).size !== events.length
  )
    throw new Error('M5_INVALID_BELIEF_REBUILD');
  const links = new Map(events.map((e) => [e.id, e.corrects]));
  for (const event of events) {
    if (
      !Number.isFinite(Date.parse(event.occurredAt)) ||
      Date.parse(event.occurredAt) > Date.parse(now)
    )
      throw new Error('M5_INVALID_EVIDENCE_TIME');
    const seen = new Set<string>();
    let id: string | null = event.id;
    while (id) {
      if (seen.has(id) || !links.has(id)) throw new Error('M5_INVALID_CORRECTION_LINEAGE');
      seen.add(id);
      id = links.get(id) ?? null;
    }
  }
  const superseded = new Set(events.map((e) => e.corrects).filter(Boolean));
  const current = events
    .filter((e) => !superseded.has(e.id) && e.evaluationValid)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const independent = current.filter(
    (e) => e.eligible && !e.assisted && !e.repeated && e.status === 'satisfied',
  );
  const covered =
    requiredCriteria.length > 0 &&
    requiredCriteria.every(
      (id) =>
        new Set(independent.filter((e) => e.criterionId === id).map((e) => e.family)).size >= 2,
    );
  const demonstrated =
    covered &&
    new Set(independent.map((e) => e.family)).size >= 2 &&
    independent.some((e) => e.role === 'explanation') &&
    independent.some((e) => e.role === 'application');
  // A later check must be an actual ledger observation recorded after the initial complete evidence set.
  let demonstrationTime: number | null = null;
  for (const e of independent) {
    const prefix = independent.filter(
      (p) => Date.parse(p.occurredAt) <= Date.parse(e.occurredAt) && !p.retentionCheck,
    );
    if (
      requiredCriteria.every(
        (id) => new Set(prefix.filter((p) => p.criterionId === id).map((p) => p.family)).size >= 2,
      ) &&
      new Set(prefix.map((p) => p.family)).size >= 2 &&
      prefix.some((p) => p.role === 'explanation') &&
      prefix.some((p) => p.role === 'application')
    ) {
      demonstrationTime = Date.parse(e.occurredAt);
      break;
    }
  }
  const retention =
    demonstrationTime !== null &&
    independent.some(
      (e) =>
        e.retentionCheck &&
        Date.parse(e.occurredAt) >= demonstrationTime! + 7 * 86400000 &&
        Date.parse(e.occurredAt) <= Date.parse(now),
    );
  const due = demonstrationTime !== null && Date.parse(now) >= demonstrationTime + 7 * 86400000;
  const hypotheses = requiredCriteria.flatMap((id) => {
    const relevant = current.filter((e) => e.criterionId === id),
      negative = relevant.filter((e) => e.status === 'not_satisfied');
    if (!negative.length) return [];
    const counterevidence = relevant.filter((e) => e.status === 'satisfied').map((e) => e.id);
    const latest = relevant.at(-1)!;
    return [
      {
        criterionId: id,
        category: latest.category,
        state: counterevidence.length
          ? latest.status === 'satisfied' &&
            new Set(independent.filter((e) => e.criterionId === id).map((e) => e.family)).size >= 2
            ? 'potential_resolution'
            : 'conflicting'
          : latest.distinguishes &&
              new Set(
                negative
                  .filter((e) => e.eligible && e.distinguishes && !e.assisted && !e.repeated)
                  .map((e) => e.family),
              ).size >= 2
            ? 'supported'
            : 'candidate',
        evidence: negative.map((e) => e.id),
        counterevidence,
      },
    ];
  });
  const payload = {
    algorithm: BELIEF_ALGORITHM,
    graphVersion,
    asOf: now,
    state: retention
      ? 'retention_supported'
      : demonstrated
        ? due
          ? 'review_due'
          : 'demonstrated_in_session'
        : current.length
          ? 'developing'
          : 'not_assessed',
    criteria: requiredCriteria.map((id) => ({
      id,
      demonstrated:
        new Set(independent.filter((e) => e.criterionId === id).map((e) => e.family)).size >= 2,
    })),
    evidenceIds: [...new Set(current.map((e) => e.id))],
    hypotheses,
    outsideHelp: 'unknown',
  };
  return { ...payload, hash: createHash('sha256').update(canonicalContent(payload)).digest('hex') };
}
