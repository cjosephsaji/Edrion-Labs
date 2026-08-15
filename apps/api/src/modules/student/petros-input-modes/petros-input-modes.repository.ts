import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lte,
  notInArray,
  schema,
  type Database,
} from '@edrion/database';
import type { PetrosModalityDashboardQuery } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';

@Injectable()
export class PetrosInputModesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findMediaByKey(scope: PetrosOwnerScope, idempotencyKey: string) {
    return this.db
      .select()
      .from(schema.petrosMediaObjects)
      .where(
        and(
          eq(schema.petrosMediaObjects.institutionId, scope.institutionId),
          eq(schema.petrosMediaObjects.studentId, scope.studentId),
          eq(schema.petrosMediaObjects.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  findMedia(scope: PetrosOwnerScope, mediaId: string) {
    return this.db
      .select()
      .from(schema.petrosMediaObjects)
      .where(
        and(
          eq(schema.petrosMediaObjects.id, mediaId),
          eq(schema.petrosMediaObjects.institutionId, scope.institutionId),
          eq(schema.petrosMediaObjects.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  createMedia(values: typeof schema.petrosMediaObjects.$inferInsert) {
    return this.db
      .insert(schema.petrosMediaObjects)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  updateMedia(
    scope: PetrosOwnerScope,
    mediaId: string,
    values: Partial<typeof schema.petrosMediaObjects.$inferInsert>,
  ) {
    return this.db
      .update(schema.petrosMediaObjects)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosMediaObjects.id, mediaId),
          eq(schema.petrosMediaObjects.institutionId, scope.institutionId),
          eq(schema.petrosMediaObjects.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  findDuplicate(scope: PetrosOwnerScope, mediaId: string, checksumSha256: string, kind: string) {
    return this.db
      .select()
      .from(schema.petrosMediaObjects)
      .where(
        and(
          eq(schema.petrosMediaObjects.institutionId, scope.institutionId),
          eq(schema.petrosMediaObjects.studentId, scope.studentId),
          eq(schema.petrosMediaObjects.kind, kind),
          eq(schema.petrosMediaObjects.checksumSha256, checksumSha256),
          notInArray(schema.petrosMediaObjects.state, ['deleted', 'expired', 'cancelled']),
          isNotNull(schema.petrosMediaObjects.storageObjectId),
        ),
      )
      .orderBy(desc(schema.petrosMediaObjects.createdAt))
      .limit(2)
      .then((rows) => rows.find((row) => row.id !== mediaId));
  }

  listJobs(scope: PetrosOwnerScope, mediaId: string) {
    return this.db
      .select()
      .from(schema.petrosMediaJobs)
      .where(
        and(
          eq(schema.petrosMediaJobs.mediaId, mediaId),
          eq(schema.petrosMediaJobs.institutionId, scope.institutionId),
          eq(schema.petrosMediaJobs.studentId, scope.studentId),
        ),
      )
      .orderBy(schema.petrosMediaJobs.createdAt);
  }

  findJobByKey(scope: PetrosOwnerScope, mediaId: string, idempotencyKey: string) {
    return this.db
      .select()
      .from(schema.petrosMediaJobs)
      .where(
        and(
          eq(schema.petrosMediaJobs.mediaId, mediaId),
          eq(schema.petrosMediaJobs.institutionId, scope.institutionId),
          eq(schema.petrosMediaJobs.studentId, scope.studentId),
          eq(schema.petrosMediaJobs.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  createJob(values: typeof schema.petrosMediaJobs.$inferInsert) {
    return this.db
      .insert(schema.petrosMediaJobs)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  updateJob(
    scope: PetrosOwnerScope,
    jobId: string,
    values: Partial<typeof schema.petrosMediaJobs.$inferInsert>,
  ) {
    return this.db
      .update(schema.petrosMediaJobs)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosMediaJobs.id, jobId),
          eq(schema.petrosMediaJobs.institutionId, scope.institutionId),
          eq(schema.petrosMediaJobs.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  recordEvent(values: typeof schema.petrosModalityEvents.$inferInsert) {
    return this.db
      .insert(schema.petrosModalityEvents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  async dailyMediaCount(scope: PetrosOwnerScope) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.petrosMediaObjects)
      .where(
        and(
          eq(schema.petrosMediaObjects.institutionId, scope.institutionId),
          eq(schema.petrosMediaObjects.studentId, scope.studentId),
          gte(schema.petrosMediaObjects.createdAt, start),
        ),
      );
    return Number(row?.value ?? 0);
  }

  async mediaReferenceCount(storageObjectId: string) {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.petrosMediaObjects)
      .where(
        and(
          eq(schema.petrosMediaObjects.storageObjectId, storageObjectId),
          notInArray(schema.petrosMediaObjects.state, ['deleted', 'expired']),
        ),
      );
    return Number(row?.value ?? 0);
  }

  deleteStorageObject(storageObjectId: string) {
    return this.db.delete(schema.storageObjects).where(eq(schema.storageObjects.id, storageObjectId));
  }

  listExpiredRaw(limit = 100) {
    return this.db
      .select()
      .from(schema.petrosMediaObjects)
      .where(
        and(
          lte(schema.petrosMediaObjects.rawMediaExpiresAt, new Date()),
          isNotNull(schema.petrosMediaObjects.storageObjectId),
          notInArray(schema.petrosMediaObjects.state, ['deleted', 'expired']),
        ),
      )
      .limit(limit);
  }

  async dashboardRows(query: PetrosModalityDashboardQuery) {
    const eventFilters = [
      ...(query.institutionId
        ? [eq(schema.petrosModalityEvents.institutionId, query.institutionId)]
        : []),
      ...(query.mode ? [eq(schema.petrosModalityEvents.mode, query.mode)] : []),
      ...(query.functionKey
        ? [eq(schema.petrosModalityEvents.functionKey, query.functionKey)]
        : []),
      ...(query.from ? [gte(schema.petrosModalityEvents.createdAt, new Date(query.from))] : []),
      ...(query.to ? [lte(schema.petrosModalityEvents.createdAt, new Date(query.to))] : []),
    ];
    const mediaFilters = [
      ...(query.institutionId
        ? [eq(schema.petrosMediaObjects.institutionId, query.institutionId)]
        : []),
      ...(query.mode ? [eq(schema.petrosMediaObjects.mode, query.mode)] : []),
      ...(query.from ? [gte(schema.petrosMediaObjects.createdAt, new Date(query.from))] : []),
      ...(query.to ? [lte(schema.petrosMediaObjects.createdAt, new Date(query.to))] : []),
    ];
    const [events, media, jobs] = await Promise.all([
      this.db
        .select()
        .from(schema.petrosModalityEvents)
        .where(eventFilters.length ? and(...eventFilters) : undefined)
        .orderBy(desc(schema.petrosModalityEvents.createdAt))
        .limit(10_000),
      this.db
        .select()
        .from(schema.petrosMediaObjects)
        .where(mediaFilters.length ? and(...mediaFilters) : undefined)
        .orderBy(desc(schema.petrosMediaObjects.createdAt))
        .limit(10_000),
      this.db
        .select()
        .from(schema.petrosMediaJobs)
        .where(
          query.institutionId
            ? eq(schema.petrosMediaJobs.institutionId, query.institutionId)
            : undefined,
        )
        .orderBy(desc(schema.petrosMediaJobs.createdAt))
        .limit(10_000),
    ]);
    return { events, media, jobs };
  }
}
