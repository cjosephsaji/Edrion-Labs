import { documentRequestType } from './document-request';
import { leaveRequestType } from './leave-request';
import { feeWaiverRequestType, paymentDisputeRequestType } from './fees';
import { odRequestType } from './od-request';
import { attendanceCorrectionType } from './attendance-correction';
import { revaluationRequestType } from './revaluation';
import type { RequestTypeConfig } from './types';

export * from './types';
export * from './leave-request';
export * from './document-request';
export * from './fees';
export * from './od-request';
export * from './attendance-correction';
export * from './revaluation';

export const REQUEST_TYPE_REGISTRY = {
  [leaveRequestType.key]: leaveRequestType,
  [documentRequestType.key]: documentRequestType,
  [feeWaiverRequestType.key]: feeWaiverRequestType,
  [paymentDisputeRequestType.key]: paymentDisputeRequestType,
  [odRequestType.key]: odRequestType,
  [attendanceCorrectionType.key]: attendanceCorrectionType,
  [revaluationRequestType.key]: revaluationRequestType,
} as const satisfies Record<string, RequestTypeConfig<any>>;

export type RequestTypeKey = keyof typeof REQUEST_TYPE_REGISTRY;

export function getRequestTypeConfig(key: string): RequestTypeConfig | undefined {
  return (REQUEST_TYPE_REGISTRY as Record<string, RequestTypeConfig>)[key];
}
