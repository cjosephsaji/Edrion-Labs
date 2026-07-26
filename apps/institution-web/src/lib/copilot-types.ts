/** Institution-portal Copilot client types (Phase 10). Mirrors the API run/tool-call shapes. */

export type AiActionStatus =
  | 'proposed'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'executed'
  | 'rejected'
  | 'expired'
  | 'failed';

export type AiGuardrailDecision = 'allow' | 'needs_confirmation' | 'needs_second_approver' | 'blocked';

export interface CopilotRun {
  id: string;
  institutionId: string;
  campusId: string | null;
  institutionUserId: string;
  userName: string | null;
  prompt: string;
  summary: string | null;
  status: AiActionStatus;
  riskLevel: string | null;
  model: string;
  startedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  errorDetail: string | null;
}

export interface CopilotToolCall {
  id: string;
  runId: string;
  toolKey: string;
  capability: string;
  explanation: string | null;
  requiredPermission: string | null;
  decision: AiGuardrailDecision;
  decisionLayer: string | null;
  decisionReason: string | null;
  riskLevel: string | null;
  reversible: boolean;
  status: AiActionStatus;
  impactPreview: { summary?: string; dataChanges?: { before: Record<string, unknown>; after: Record<string, unknown> } | null } | null;
  result: Record<string, unknown> | null;
  errorDetail: string | null;
}

export interface CopilotConfirmation {
  id: string;
  runId: string;
  userName: string | null;
  method: string;
  reason: string | null;
  createdAt: string;
}

export interface CopilotRunDetail {
  run: CopilotRun;
  toolCalls: CopilotToolCall[];
  confirmations: CopilotConfirmation[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CopilotRunContext {
  campusId?: string;
  studentId?: string;
  announcementId?: string;
  title?: string;
  query?: string;
}
