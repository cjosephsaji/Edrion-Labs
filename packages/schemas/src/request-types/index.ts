import { documentRequestType } from './document-request';
import { leaveRequestType } from './leave-request';
import { feeWaiverRequestType, paymentDisputeRequestType } from './fees';
import type { RequestTypeConfig } from './types';

export * from './types';
export * from './leave-request';
export * from './document-request';
export * from './fees';

export const REQUEST_TYPE_REGISTRY = {
  [leaveRequestType.key]: leaveRequestType,
  [documentRequestType.key]: documentRequestType,
  [feeWaiverRequestType.key]: feeWaiverRequestType,
  [paymentDisputeRequestType.key]: paymentDisputeRequestType,
} as const satisfies Record<string, RequestTypeConfig<any>>;

export type RequestTypeKey = keyof typeof REQUEST_TYPE_REGISTRY;

export function getRequestTypeConfig(key: string): RequestTypeConfig | undefined {
  return (REQUEST_TYPE_REGISTRY as Record<string, RequestTypeConfig>)[key];
}
