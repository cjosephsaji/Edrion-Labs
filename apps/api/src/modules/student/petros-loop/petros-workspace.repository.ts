import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import type { EngineSnapshot, EngineCommand, PetrosKnowledgePolicy } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from './petros-loop.repository';

@Injectable()
export class PetrosWorkspaceRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async block(scope: PetrosOwnerScope, sessionId: string, blockId: string, lock = false) {
    const t = schema.petrosTeachingBlocks;
    const q = this.db.select().from(t).where(and(eq(t.id, blockId), eq(t.sessionId, sessionId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1);
    return (await (lock ? q.for('no key update') : q))[0];
  }
  async current(scope: PetrosOwnerScope, blockId: string) {
    const t = schema.petrosWorkspaces;
    return (await this.db.select().from(t).where(and(eq(t.id, blockId), eq(t.institutionId, scope.institutionId),
      eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async receipt(scope: PetrosOwnerScope, blockId: string, operationId: string) {
    const t = schema.petrosWorkspaceOperations;
    return (await this.db.select().from(t).where(and(eq(t.blockId, blockId), eq(t.operationId, operationId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async checkpoint(scope: PetrosOwnerScope, workspaceId: string, checkpointId: string) {
    const t = schema.petrosWorkspaceCheckpoints;
    return (await this.db.select().from(t).where(and(eq(t.id, checkpointId), eq(t.workspaceId, workspaceId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async latestCheckpoint(scope: PetrosOwnerScope, workspaceId: string, version: number) {
    const t = schema.petrosWorkspaceCheckpoints;
    return (await this.db.select().from(t).where(and(eq(t.workspaceId, workspaceId), eq(t.version, version),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async operationByCheckpoint(scope: PetrosOwnerScope, blockId: string, checkpointId: string) {
    const t = schema.petrosWorkspaceOperations;
    return (await this.db.select().from(t).where(and(eq(t.checkpointId, checkpointId), eq(t.blockId, blockId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async history(scope: PetrosOwnerScope, workspaceId: string) {
    const t = schema.petrosWorkspaceCheckpoints;
    return this.db.select({ id: t.id, version: t.version, branchId: t.branchId,
      parentCheckpointId: t.parentCheckpointId, createdAt: t.createdAt }).from(t)
      .where(and(eq(t.workspaceId, workspaceId), eq(t.institutionId, scope.institutionId),
        eq(t.studentId, scope.studentId))).orderBy(desc(t.version)).limit(50);
  }
  async commit(scope: PetrosOwnerScope, sessionId: string, blockId: string, version: number,
    snapshot: EngineSnapshot, policy: PetrosKnowledgePolicy, command: EngineCommand,
    commandHash: string, checkpointId: string, parentCheckpointId: string | null) {
    const t = schema.petrosWorkspaces;
    if (version === 1) await this.db.insert(t).values({ ...scope, id: blockId, sessionId, blockId, version, snapshot, policy });
    else await this.db.update(t).set({ version, snapshot, policy, updatedAt: new Date() })
      .where(and(eq(t.id, blockId), eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId)));
    await this.db.insert(schema.petrosWorkspaceCheckpoints).values({ ...scope, id: checkpointId,
      workspaceId: blockId, version, snapshot, branchId: snapshot.execution.branchId, parentCheckpointId });
    await this.db.insert(schema.petrosWorkspaceOperations).values({ ...scope, sessionId, blockId,
      operationId: command.operationId, commandHash, command, status: 'committed', checkpointId });
  }
  async cancel(scope: PetrosOwnerScope, sessionId: string, blockId: string, command: EngineCommand, commandHash: string) {
    await this.db.insert(schema.petrosWorkspaceOperations).values({ ...scope, sessionId, blockId,
      operationId: command.operationId, commandHash, command, status: 'cancelled', checkpointId: null });
  }

  async predictionChallenge(scope: PetrosOwnerScope, blockId: string, challengeId: string) {
    const t = schema.petrosWorkspacePredictionChallenges;
    return (await this.db.select().from(t).where(and(eq(t.id, challengeId), eq(t.workspaceId, blockId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async predictionByRequest(scope: PetrosOwnerScope, blockId: string, requestId: string) {
    const t = schema.petrosWorkspacePredictionChallenges;
    return (await this.db.select().from(t).where(and(eq(t.requestId, requestId), eq(t.workspaceId, blockId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async predictionResponse(scope: PetrosOwnerScope, challengeId: string) {
    const t = schema.petrosWorkspacePredictionResponses;
    return (await this.db.select().from(t).where(and(eq(t.challengeId, challengeId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async insertPredictionChallenge(value: typeof schema.petrosWorkspacePredictionChallenges.$inferInsert) {
    await this.db.insert(schema.petrosWorkspacePredictionChallenges).values(value);
  }
  async insertPredictionResponse(value: typeof schema.petrosWorkspacePredictionResponses.$inferInsert) {
    await this.db.insert(schema.petrosWorkspacePredictionResponses).values(value);
  }
}
