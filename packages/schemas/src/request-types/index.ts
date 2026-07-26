import { documentRequestType } from './document-request';
import { leaveRequestType } from './leave-request';
import { feeWaiverRequestType, paymentDisputeRequestType } from './fees';
import { odRequestType } from './od-request';
import { attendanceCorrectionType } from './attendance-correction';
import { revaluationRequestType } from './revaluation';
import { hostelOutpassRequestType } from './hostel-outpass';
import { campusLibraryRenewalRequestType } from './campus-library-renewal';
import { transportChangeRequestType } from './transport-change';
import { transportRenewalRequestType } from './transport-renewal';
import { idCardReissueRequestType } from './id-card-reissue';
import { clubJoinRequestType } from './club-join';
import { grievanceRequestType } from './grievance';
import { helpdeskTicketRequestType } from './helpdesk-ticket';
import { sensitiveReportRequestType } from './sensitive-report';
import { healthProfileUpdateRequestType } from './health-profile-update';
import { loanRenewalRequestType } from './loan-renewal';
import type { RequestTypeConfig } from './types';

export * from './types';
export * from './leave-request';
export * from './document-request';
export * from './fees';
export * from './od-request';
export * from './attendance-correction';
export * from './revaluation';
export * from './hostel-outpass';
export * from './campus-library-renewal';
export * from './transport-change';
export * from './transport-renewal';
export * from './id-card-reissue';
export * from './club-join';
export * from './grievance';
export * from './helpdesk-ticket';
export * from './sensitive-report';
export * from './health-profile-update';
export * from './loan-renewal';

export const REQUEST_TYPE_REGISTRY = {
  [leaveRequestType.key]: leaveRequestType,
  [documentRequestType.key]: documentRequestType,
  [feeWaiverRequestType.key]: feeWaiverRequestType,
  [paymentDisputeRequestType.key]: paymentDisputeRequestType,
  [odRequestType.key]: odRequestType,
  [attendanceCorrectionType.key]: attendanceCorrectionType,
  [revaluationRequestType.key]: revaluationRequestType,
  [hostelOutpassRequestType.key]: hostelOutpassRequestType,
  [campusLibraryRenewalRequestType.key]: campusLibraryRenewalRequestType,
  [transportChangeRequestType.key]: transportChangeRequestType,
  [transportRenewalRequestType.key]: transportRenewalRequestType,
  [idCardReissueRequestType.key]: idCardReissueRequestType,
  [clubJoinRequestType.key]: clubJoinRequestType,
  [grievanceRequestType.key]: grievanceRequestType,
  [helpdeskTicketRequestType.key]: helpdeskTicketRequestType,
  [sensitiveReportRequestType.key]: sensitiveReportRequestType,
  [healthProfileUpdateRequestType.key]: healthProfileUpdateRequestType,
  [loanRenewalRequestType.key]: loanRenewalRequestType,
} as const satisfies Record<string, RequestTypeConfig<any>>;

export type RequestTypeKey = keyof typeof REQUEST_TYPE_REGISTRY;

export function getRequestTypeConfig(key: string): RequestTypeConfig | undefined {
  return (REQUEST_TYPE_REGISTRY as Record<string, RequestTypeConfig>)[key];
}
