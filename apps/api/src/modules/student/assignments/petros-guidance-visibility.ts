import { isNull, or, schema, sql } from '@edrion/database';

/** Personalized learning goals never inherit visibility from the whole class. */
export function petrosGuidanceVisibility(studentId: string) {
  return or(isNull(schema.assignments.petrosGuidance), sql`exists (
    select 1 from ${schema.assignmentAssignees}
    where ${schema.assignmentAssignees.assignmentId} = ${schema.assignments.id}
      and ${schema.assignmentAssignees.studentId} = ${studentId}::uuid
  )`);
}
