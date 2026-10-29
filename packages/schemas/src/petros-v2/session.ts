import { z } from 'zod';
import { v2Hash, v2Key, v2Uuid } from './content';
import { releaseScopePinSchema } from './proposal';
const revision = z.number().int().nonnegative().max(1_000_000);
export const operationAcknowledgmentSchema = z.object({ operationId: v2Uuid, commandId: v2Uuid,
  actionId: v2Uuid, sequence: revision, epoch: revision, canvasRevision: revision,
  status: z.enum(['committed', 'rejected', 'cancelled']), reason: z.string().max(500).nullable(),
}).strict();
export const v2SessionSchema = z.object({ schemaVersion: z.literal('petros.v2.session.v1'), engine: z.literal('v2'),
  id: v2Uuid, institutionId: v2Uuid, studentId: v2Uuid, scope: releaseScopePinSchema,
  status: z.enum(['active', 'paused', 'closed']), revision, turnEpoch: revision, actionSequence: revision,
  canvasRevision: revision, studentDraftRevision: revision,
  checkpoint: z.object({ timelineId: v2Uuid, beatId: v2Key, completedOperations: z.array(v2Uuid).max(100),
    speechSegmentId: v2Uuid.nullable(), audioOffsetMs: z.number().int().min(0).max(600_000) }).strict().nullable(),
  acknowledgments: z.array(operationAcknowledgmentSchema).max(100), submissions: z.array(v2Uuid).max(100),
  recovery: z.object({ status: z.enum(['consistent', 'interrupted', 'revalidation_required']),
    interruptedCommandId: v2Uuid.nullable(), resumeEpoch: revision }).strict(),
}).strict().superRefine((s, ctx) => {
  if (s.acknowledgments.some(a => a.epoch > s.turnEpoch || a.sequence > s.actionSequence || a.canvasRevision > s.canvasRevision) ||
    new Set(s.submissions).size !== s.submissions.length || s.recovery.resumeEpoch < s.turnEpoch)
    ctx.addIssue({ code: 'custom', message: 'Invalid session acknowledgment or recovery state' });
});
export const v2CommandSchema = z.object({ schemaVersion: z.literal('petros.v2.command.v1'), commandId: v2Uuid,
  sessionId: v2Uuid, expectedRevision: revision, expectedEpoch: revision, expectedCanvasRevision: revision,
  expectedDraftRevision: revision, requestHash: v2Hash,
  type: z.enum(['next', 'pause', 'resume', 'interrupt', 'close']),
}).strict();
export function validateSessionPreconditions(command: z.infer<typeof v2CommandSchema>, session: z.infer<typeof v2SessionSchema>) {
  if (command.sessionId !== session.id || command.expectedRevision !== session.revision || command.expectedEpoch !== session.turnEpoch ||
    command.expectedCanvasRevision !== session.canvasRevision || command.expectedDraftRevision !== session.studentDraftRevision || session.status === 'closed')
    throw new Error('STALE_SESSION_PRECONDITION');
}
