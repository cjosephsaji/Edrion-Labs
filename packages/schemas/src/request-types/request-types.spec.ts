import { describe, expect, it } from 'vitest';
import { documentRequestPayloadSchema } from './document-request';
import { leaveRequestPayloadSchema } from './leave-request';
import { REQUEST_TYPE_REGISTRY } from './index';

describe('request type schemas', () => {
  it('normalizes leave defaults and rejects inverted ranges', () => {
    expect(leaveRequestPayloadSchema.parse({ start_date: '2026-08-12', end_date: '2026-08-14', reason: 'medical' })).toMatchObject({ scope: 'full_day', notify_sessions: [] });
    expect(leaveRequestPayloadSchema.safeParse({ start_date: '2026-08-14', end_date: '2026-08-12', reason: 'medical' }).success).toBe(false);
    expect(leaveRequestPayloadSchema.safeParse({ start_date: '2026-02-30', end_date: '2026-03-01', reason: 'medical' }).success).toBe(false);
  });

  it('requires an explanation for other leave reasons', () => {
    expect(leaveRequestPayloadSchema.safeParse({ start_date: '2026-08-12', end_date: '2026-08-12', reason: 'other', reason_text: 'short' }).success).toBe(false);
  });

  it('enforces document-specific fields', () => {
    expect(documentRequestPayloadSchema.safeParse({ doc_type: 'bonafide' }).success).toBe(false);
    expect(documentRequestPayloadSchema.safeParse({ doc_type: 'bonafide', purpose: 'visa' }).success).toBe(true);
    expect(documentRequestPayloadSchema.safeParse({ doc_type: 'transcript' }).success).toBe(false);
    expect(documentRequestPayloadSchema.safeParse({ doc_type: 'transcript', copies: 2 }).success).toBe(true);
  });

  it('keeps type behavior in the registry rather than engine branches', () => {
    expect(Object.keys(REQUEST_TYPE_REGISTRY)).toEqual([
      'leave_request',
      'document_request',
      'fee_waiver',
      'payment_dispute',
      'od_request',
      'attendance_correction',
      'revaluation',
      'hostel_outpass',
      'campus_library_renewal',
      'transport_change',
      'transport_renewal',
      'id_card_reissue',
      'club_join',
      'grievance',
      'helpdesk_ticket',
      'sensitive_report',
      'health_profile_update',
      'loan_renewal',
    ]);
    expect(REQUEST_TYPE_REGISTRY.leave_request!.approvalSideEffectKey).toBe('leave_attendance');
    expect(REQUEST_TYPE_REGISTRY.document_request!.producesDocument).toBe(true);
    expect(REQUEST_TYPE_REGISTRY.sensitive_report!.key).toBe('sensitive_report');
  });
});
