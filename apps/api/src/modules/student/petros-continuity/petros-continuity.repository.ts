import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, sql, type Database } from '@edrion/database';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class PetrosContinuityRepository {
  constructor(@Inject(DATABASE) readonly db: Database) {}
  owner(table: { institutionId: AnyPgColumn; studentId: AnyPgColumn }, p: InstitutionalStudentPrincipal) {
    return and(eq(table.institutionId, p.institutionId), eq(table.studentId, p.studentId));
  }
  async lock(p: InstitutionalStudentPrincipal) {
    // Follow source/policy owner lock ordering before taking the learner continuity lock.
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${p.institutionId}`},0))`);
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-continuity:${p.institutionId}:${p.studentId}`},0))`);
  }
  async preferences(p: InstitutionalStudentPrincipal) {
    const t = schema.petrosStudentCompanionPreferences;
    await this.db.insert(t).values({ institutionId: p.institutionId, studentId: p.studentId }).onConflictDoNothing();
    const [row] = await this.db.select().from(t).where(this.owner(t, p)).limit(1);
    return row!;
  }
  async receipt(p: InstitutionalStudentPrincipal, commandId: string) {
    const t = schema.petrosContinuityReceipts;
    const [row] = await this.db.select().from(t).where(and(this.owner(t, p), eq(t.commandId, commandId))).limit(1);
    return row;
  }
  async journey(p: InstitutionalStudentPrincipal, id: string) {
    const t = schema.petrosJourneys;
    const [row] = await this.db.select().from(t).where(and(this.owner(t, p), eq(t.id, id))).limit(1);
    return row;
  }
  async sessionJourney(p: InstitutionalStudentPrincipal, sessionId: string) {
    const t = schema.petrosJourneySessions;
    const [row] = await this.db.select().from(t).where(and(this.owner(t, p), eq(t.sessionId, sessionId))).limit(1);
    return row ? this.journey(p, row.journeyId) : undefined;
  }
  async journeys(p: InstitutionalStudentPrincipal) {
    const t = schema.petrosJourneys;
    return this.db.select().from(t).where(this.owner(t, p)).orderBy(desc(t.updatedAt)).limit(30);
  }
  async memory(p: InstitutionalStudentPrincipal, id: string) {
    const t = schema.petrosMemoryRecords;
    const [row] = await this.db.select().from(t).where(and(this.owner(t, p), eq(t.id, id))).limit(1);
    return row;
  }
  async memories(p: InstitutionalStudentPrincipal) {
    const t = schema.petrosMemoryRecords;
    return this.db.select().from(t).where(this.owner(t, p)).orderBy(desc(t.updatedAt)).limit(200);
  }
}
