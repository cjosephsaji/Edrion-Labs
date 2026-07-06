import type { HomeworkAiPolicy } from '@edrion/shared-types';

export interface HomeworkPolicyResult {
  policy: HomeworkAiPolicy;
  note: string;
  available: boolean;
}

export interface HomeworkPolicyPort {
  resolveForHomework(homeworkId: string, studentId: string): Promise<HomeworkPolicyResult>;
  resolveForAssignment(assignmentId: string, studentId: string): Promise<HomeworkPolicyResult>;
}

export const AI_POLICY_UNAVAILABLE: HomeworkPolicyResult = {
  policy: 'off',
  note: 'AI policy unavailable for this context.',
  available: false,
};
