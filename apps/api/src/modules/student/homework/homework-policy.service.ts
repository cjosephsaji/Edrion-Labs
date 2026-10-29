import { Inject, Injectable } from '@nestjs/common';
import { petrosGuidanceVisibility } from '../assignments/petros-guidance-visibility';
import { and, eq, schema, type Database } from '@edrion/database';
import { HOMEWORK_AI_POLICY_NOTES, type HomeworkAiPolicy } from '@edrion/shared-types';
import { DATABASE } from '../../../common/tokens';
import type { HomeworkPolicyPort, HomeworkPolicyResult } from './homework-policy.port';

@Injectable()
export class HomeworkPolicyService implements HomeworkPolicyPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolveForHomework(homeworkId: string, studentId: string): Promise<HomeworkPolicyResult> {
    const [row] = await this.db
      .select({ aiPolicy: schema.homework.aiPolicy })
      .from(schema.homework)
      .innerJoin(schema.homeworkSubmissions, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .where(and(eq(schema.homework.id, homeworkId), eq(schema.homeworkSubmissions.studentId, studentId)))
      .limit(1);
    if (!row) return { policy: 'off', note: HOMEWORK_AI_POLICY_NOTES.off, available: false };
    return this.toResult(row.aiPolicy as HomeworkAiPolicy);
  }

  async resolveForAssignment(assignmentId: string, studentId: string): Promise<HomeworkPolicyResult> {
    const [row] = await this.db
      .select({ aiPolicy: schema.assignments.aiPolicy })
      .from(schema.assignments)
      .innerJoin(schema.assignmentSubmissions, eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id))
      .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignmentSubmissions.studentId, studentId),
        petrosGuidanceVisibility(studentId)))
      .limit(1);
    if (!row) {
      const [a] = await this.db
        .select({ aiPolicy: schema.assignments.aiPolicy })
        .from(schema.assignments)
        .where(and(eq(schema.assignments.id, assignmentId), petrosGuidanceVisibility(studentId)))
        .limit(1);
      if (!a) return { policy: 'off', note: HOMEWORK_AI_POLICY_NOTES.off, available: false };
      return this.toResult(a.aiPolicy as HomeworkAiPolicy);
    }
    return this.toResult(row.aiPolicy as HomeworkAiPolicy);
  }

  private toResult(policy: HomeworkAiPolicy): HomeworkPolicyResult {
    return { policy, note: HOMEWORK_AI_POLICY_NOTES[policy], available: true };
  }
}
