import type { ReadinessScope } from '@edrion/database';
import type { PetrosContentIntelligenceService } from './petros-content-intelligence.service';
import type { InterpretationAuthorization } from './petros-content-interpretation';
import { validateSourceReservation } from '../../petros-ai-routing/petros-source-reservation';

export async function runM2QualificationPilot(
  service: Pick<PetrosContentIntelligenceService, 'interpret'>,
  cases: Array<{
    scope: ReadinessScope;
    revisionId: string;
    authorization?: InterpretationAuthorization;
  }>,
  approvedTotalSpendMicros: number,
  signal: AbortSignal,
) {
  if (
    cases.length !== 2 ||
    !Number.isSafeInteger(approvedTotalSpendMicros) ||
    approvedTotalSpendMicros <= 0
  )
    throw new Error('M2_PILOT_APPROVAL_REQUIRED');
  const reservations = cases.map((candidate) => {
    const authorization = candidate.authorization;
    if (
      !authorization ||
      authorization.mode !== 'authorized_live' ||
      !authorization.sourceReservation
    )
      throw new Error('M2_PILOT_APPROVAL_REQUIRED');
    const reservation = validateSourceReservation(authorization.sourceReservation);
    if (
      reservation.sourceRevisionId !== candidate.revisionId ||
      candidate.scope.studentId ||
      reservation.staffActorId !== candidate.scope.institutionUserId ||
      reservation.institutionId !== candidate.scope.institutionId
    )
      throw new Error('M2_PILOT_SOURCE_SCOPE_INVALID');
    return reservation;
  });
  const first = reservations[0]!;
  if (
    new Set(reservations.map((value) => value.requestId)).size !== 2 ||
    new Set(reservations.map((value) => value.sourceRevisionId)).size !== 2 ||
    reservations.some(
      (value) =>
        value.routeId !== first.routeId ||
        value.providerKey !== first.providerKey ||
        value.modelKey !== first.modelKey,
    ) ||
    reservations.reduce((total, value) => total + value.maxSpendMicros, 0) >
      approvedTotalSpendMicros
  )
    throw new Error('M2_PILOT_ROUTE_OR_BUDGET_INVALID');
  const results = [];
  for (const candidate of cases) {
    signal.throwIfAborted();
    const result = await service.interpret(
      candidate.scope,
      candidate.revisionId,
      candidate.authorization,
      signal,
    );
    if (result.status !== 'proposed' || !result.liveVerified)
      throw new Error('M2_PILOT_GENUINE_RECEIPT_REQUIRED');
    results.push(result);
  }
  return {
    results,
    academicApproval: false as const,
    qualification: 'route_smoke_test_only' as const,
  };
}
