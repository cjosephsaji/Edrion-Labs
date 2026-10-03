import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import type { PetrosProjectileSnapshot } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from './petros-loop.repository';

@Injectable()
export class PetrosProjectileRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async block(scope: PetrosOwnerScope, sessionId: string, blockId: string, lock = false) {
    const t = schema.petrosTeachingBlocks;
    const query = this.db.select().from(t).where(and(eq(t.id, blockId), eq(t.sessionId, sessionId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1);
    return (await (lock ? query.for('no key update') : query))[0];
  }
  async receipt(scope: PetrosOwnerScope, blockId: string, operationId: string) {
    const t = schema.petrosVisualOperations;
    return (await this.db.select().from(t).where(and(eq(t.blockId, blockId), eq(t.operationId, operationId),
      eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId))).limit(1))[0];
  }
  async commit(scope: PetrosOwnerScope, blockId: string, snapshot: PetrosProjectileSnapshot) {
    const t = schema.petrosTeachingBlocks;
    await this.db.update(t).set({ projectileSnapshot: snapshot, updatedAt: new Date() })
      .where(and(eq(t.id, blockId), eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId)));
    await this.db.insert(schema.petrosVisualOperations).values({ ...scope, blockId,
      operationId: snapshot.operationId, commandHash: snapshot.commandHash, status: 'committed', snapshot });
  }
  async cancel(scope: PetrosOwnerScope, blockId: string, operationId: string, commandHash: string) {
    await this.db.insert(schema.petrosVisualOperations).values({ ...scope, blockId, operationId,
      commandHash, status: 'cancelled', snapshot: null });
  }
}
