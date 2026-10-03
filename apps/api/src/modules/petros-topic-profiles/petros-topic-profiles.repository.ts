import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type { PetrosTopicProfileListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class PetrosTopicProfilesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findOrCreateLearnTopic(input: {
    topicKey: string;
    canonicalTitle: string;
    subjectLabel: string;
    curriculumKey: string;
  }): Promise<typeof schema.learnTopics.$inferSelect> {
    const [existing] = await this.db
      .select()
      .from(schema.learnTopics)
      .where(
        and(
          eq(schema.learnTopics.topicKey, input.topicKey),
          eq(schema.learnTopics.curriculumKey, input.curriculumKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
    const [created] = await this.db
      .insert(schema.learnTopics)
      .values({
        topicKey: input.topicKey,
        title: input.canonicalTitle,
        subjectLabel: input.subjectLabel,
        curriculumKey: input.curriculumKey,
        domainArchetype: 'petros_profiled',
        source: 'petros_stage4',
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    return this.findOrCreateLearnTopic(input);
  }

  findByIdentity(topicKey: string, curriculumKey: string, gradeBand: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfiles)
      .where(
        and(
          eq(schema.petrosTopicProfiles.topicKey, topicKey),
          eq(schema.petrosTopicProfiles.curriculumKey, curriculumKey),
          eq(schema.petrosTopicProfiles.gradeBand, gradeBand),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  findProfile(id: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfiles)
      .where(eq(schema.petrosTopicProfiles.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  list(query: PetrosTopicProfileListQuery) {
    const filters = [
      query.subject ? eq(schema.petrosTopicProfiles.subjectKey, query.subject) : undefined,
      query.grade ? eq(schema.petrosTopicProfiles.gradeBand, query.grade) : undefined,
      query.curriculum
        ? eq(schema.petrosTopicProfiles.curriculumKey, query.curriculum)
        : undefined,
      query.status ? eq(schema.petrosTopicProfiles.status, query.status) : undefined,
      query.stale === true ? eq(schema.petrosTopicProfiles.status, 'stale') : undefined,
      query.search
        ? or(
            ilike(schema.petrosTopicProfiles.canonicalTitle, `%${query.search}%`),
            ilike(schema.petrosTopicProfiles.topicKey, `%${query.search}%`),
            ilike(schema.petrosTopicProfiles.subjectLabel, `%${query.search}%`),
          )
        : undefined,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value));
    return this.db
      .select()
      .from(schema.petrosTopicProfiles)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.petrosTopicProfiles.subjectLabel), asc(schema.petrosTopicProfiles.canonicalTitle))
      .limit(query.limit);
  }

  async createProfile(values: typeof schema.petrosTopicProfiles.$inferInsert) {
    const [created] = await this.db
      .insert(schema.petrosTopicProfiles)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (created) return { profile: created, created: true as const };

    // INSERT ... ON CONFLICT waits for a competing insert to commit. This
    // subsequent statement then reads the winner under PostgreSQL READ COMMITTED.
    const existing = await this.findByIdentity(
      values.topicKey,
      values.curriculumKey,
      values.gradeBand,
    );
    if (!existing) throw new Error('PETROS_TOPIC_PROFILE_CACHE_KEY_CONFLICT');
    return { profile: existing, created: false as const };
  }

  listVersions(profileId: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfileVersions)
      .where(eq(schema.petrosTopicProfileVersions.profileId, profileId))
      .orderBy(desc(schema.petrosTopicProfileVersions.version));
  }

  findVersion(profileId: string, version: number) {
    return this.db
      .select()
      .from(schema.petrosTopicProfileVersions)
      .where(
        and(
          eq(schema.petrosTopicProfileVersions.profileId, profileId),
          eq(schema.petrosTopicProfileVersions.version, version),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  findPublishedVersion(profileId: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfileVersions)
      .where(
        and(
          eq(schema.petrosTopicProfileVersions.profileId, profileId),
          eq(schema.petrosTopicProfileVersions.status, 'published'),
        ),
      )
      .orderBy(desc(schema.petrosTopicProfileVersions.version))
      .limit(1)
      .then((rows) => rows[0]);
  }

  async insertVersion(
    values: typeof schema.petrosTopicProfileVersions.$inferInsert,
    prerequisites: Array<typeof schema.petrosTopicProfilePrerequisites.$inferInsert>,
    misconceptions: Array<typeof schema.petrosTopicProfileMisconceptions.$inferInsert>,
  ) {
    return this.db.transaction(async (tx) => {
      const [version] = await tx.insert(schema.petrosTopicProfileVersions).values(values).returning();
      if (prerequisites.length)
        await tx.insert(schema.petrosTopicProfilePrerequisites).values(
          prerequisites.map((item) => ({ ...item, profileVersionId: version!.id })),
        );
      if (misconceptions.length)
        await tx.insert(schema.petrosTopicProfileMisconceptions).values(
          misconceptions.map((item) => ({ ...item, profileVersionId: version!.id })),
        );
      await tx
        .update(schema.petrosTopicProfiles)
        .set({
          // A new generated or edited draft must not demote an already published
          // human-reviewed profile. Invalidated profiles remain visibly stale.
          status: sql`case
            when ${schema.petrosTopicProfiles.publishedVersionId} is null then 'draft'
            else ${schema.petrosTopicProfiles.status}
          end`,
          cacheKey: values.profile.cache.key,
          invalidationInputs: values.profile.cache.invalidationInputs,
          version: sql`${schema.petrosTopicProfiles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.petrosTopicProfiles.id, values.profileId));
      return version!;
    });
  }

  async publish(profileId: string, targetVersion: number, expectedVersion: number, reviewer: string) {
    return this.db.transaction(async (tx) => {
      const [profile] = await tx
        .update(schema.petrosTopicProfiles)
        .set({
          status: 'published',
          staleReason: null,
          version: sql`${schema.petrosTopicProfiles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTopicProfiles.id, profileId),
            eq(schema.petrosTopicProfiles.version, expectedVersion),
          ),
        )
        .returning();
      if (!profile) return null;
      const [target] = await tx
        .select()
        .from(schema.petrosTopicProfileVersions)
        .where(
          and(
            eq(schema.petrosTopicProfileVersions.profileId, profileId),
            eq(schema.petrosTopicProfileVersions.version, targetVersion),
          ),
        )
        .limit(1);
      if (!target) return null;
      await tx
        .update(schema.petrosTopicProfileVersions)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(schema.petrosTopicProfileVersions.profileId, profileId),
            eq(schema.petrosTopicProfileVersions.status, 'published'),
          ),
        );
      const [published] = await tx
        .update(schema.petrosTopicProfileVersions)
        .set({ status: 'published', reviewedBy: reviewer, publishedAt: new Date() })
        .where(eq(schema.petrosTopicProfileVersions.id, target.id))
        .returning();
      await tx
        .update(schema.petrosTopicProfiles)
        .set({ publishedVersionId: target.id, cacheVersion: sql`${schema.petrosTopicProfiles.cacheVersion} + 1` })
        .where(eq(schema.petrosTopicProfiles.id, profileId));
      return { profile, version: published! };
    });
  }

  touchCacheHit(profileId: string) {
    return this.db
      .update(schema.petrosTopicProfiles)
      .set({ cacheHitCount: sql`${schema.petrosTopicProfiles.cacheHitCount} + 1`, updatedAt: new Date() })
      .where(eq(schema.petrosTopicProfiles.id, profileId));
  }

  markStale(
    profileId: string,
    reason: string,
    nextInputs: Record<string, string>,
    actorRef?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [profile] = await tx
        .update(schema.petrosTopicProfiles)
        .set({ status: 'stale', staleReason: reason, updatedAt: new Date() })
        .where(eq(schema.petrosTopicProfiles.id, profileId))
        .returning();
      if (profile)
        await tx.insert(schema.petrosTopicProfileInvalidations).values({
          profileId,
          reason,
          previousInputs: profile.invalidationInputs,
          nextInputs,
          createdBy: actorRef,
        });
      return profile;
    });
  }

  listOverrides(profileId: string, institutionId?: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfileOverrides)
      .where(
        and(
          eq(schema.petrosTopicProfileOverrides.profileId, profileId),
          institutionId
            ? eq(schema.petrosTopicProfileOverrides.institutionId, institutionId)
            : undefined,
        ),
      )
      .orderBy(desc(schema.petrosTopicProfileOverrides.version));
  }

  findPublishedOverride(profileId: string, institutionId: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfileOverrides)
      .where(
        and(
          eq(schema.petrosTopicProfileOverrides.profileId, profileId),
          eq(schema.petrosTopicProfileOverrides.institutionId, institutionId),
          eq(schema.petrosTopicProfileOverrides.status, 'published'),
        ),
      )
      .orderBy(desc(schema.petrosTopicProfileOverrides.version))
      .limit(1)
      .then((rows) => rows[0]);
  }

  async publishOverride(values: typeof schema.petrosTopicProfileOverrides.$inferInsert) {
    return this.db.transaction(async (tx) => {
      await tx
        .update(schema.petrosTopicProfileOverrides)
        .set({ status: 'archived', archivedAt: new Date() })
        .where(
          and(
            eq(schema.petrosTopicProfileOverrides.profileId, values.profileId),
            eq(schema.petrosTopicProfileOverrides.institutionId, values.institutionId),
            eq(schema.petrosTopicProfileOverrides.status, 'published'),
          ),
        );
      const [created] = await tx
        .insert(schema.petrosTopicProfileOverrides)
        .values({ ...values, status: 'published', publishedAt: new Date() })
        .returning();
      await tx
        .update(schema.petrosTopicProfiles)
        .set({ cacheVersion: sql`${schema.petrosTopicProfiles.cacheVersion} + 1`, updatedAt: new Date() })
        .where(eq(schema.petrosTopicProfiles.id, values.profileId));
      return created!;
    });
  }

  listAudits(profileId: string) {
    return this.db
      .select()
      .from(schema.petrosTopicProfileAudits)
      .where(eq(schema.petrosTopicProfileAudits.profileId, profileId))
      .orderBy(desc(schema.petrosTopicProfileAudits.createdAt))
      .limit(100);
  }

  recordAudit(values: typeof schema.petrosTopicProfileAudits.$inferInsert) {
    return this.db.insert(schema.petrosTopicProfileAudits).values(values);
  }
}
