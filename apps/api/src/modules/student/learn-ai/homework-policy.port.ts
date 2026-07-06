export type HomeworkAiPolicy = 'full' | 'hints_only' | 'off';

export interface HomeworkPolicyPort {
  resolve(contextKind: string, contextId: string): Promise<HomeworkAiPolicy>;
}

export const HOMEWORK_POLICY_PORT = Symbol('HOMEWORK_POLICY_PORT');

export class DefaultHomeworkPolicyPort implements HomeworkPolicyPort {
  async resolve(contextKind: string, _contextId: string): Promise<HomeworkAiPolicy> {
    if (contextKind === 'homework') {
      return 'full';
    }
    return 'full';
  }
}

export const AI_POLICY_UNAVAILABLE =
  'Homework AI policy is not yet configured for this assignment.';
