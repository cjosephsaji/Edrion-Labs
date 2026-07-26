import { ConflictException } from '@nestjs/common';
import type { RequestStatus } from '@edrion/schemas';

const ALLOWED: Record<RequestStatus, readonly RequestStatus[]> = {
  draft: ['submitted'],
  submitted: ['in_review', 'needs_info', 'approved', 'rejected', 'cancelled'],
  in_review: ['needs_info', 'approved', 'rejected'],
  needs_info: ['in_review', 'cancelled', 'expired'],
  approved: ['fulfilled', 'in_review'],
  rejected: [],
  fulfilled: [],
  cancelled: [],
  expired: [],
};

export function assertRequestTransition(from: string, to: string): void {
  if ((ALLOWED[from as RequestStatus] ?? []).includes(to as RequestStatus)) return;
  throw new ConflictException({
    code: 'ILLEGAL_TRANSITION',
    message: `Cannot transition this request from ${from} to ${to}.`,
    currentStatus: from,
  });
}

export function canStudentCancel(
  status: string,
  assignedUserId: string | null,
  cancellableStatuses: readonly RequestStatus[],
): boolean {
  return !assignedUserId && status !== 'in_review' && cancellableStatuses.includes(status as RequestStatus);
}
