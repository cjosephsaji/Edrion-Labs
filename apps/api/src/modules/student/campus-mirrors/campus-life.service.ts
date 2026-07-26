import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { ExamPrepTodayService } from '../exam-prep/exam-prep-today.service';

@Injectable()
export class CampusLifeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly todaySync: ExamPrepTodayService,
  ) {}

  private requireInstitutional(p: StudentPrincipal) {
    if (p.kind !== 'institutional') {
      throw new ForbiddenException({ code: 'INSTITUTION_ONLY', message: 'Campus life requires a school account.' });
    }
    return p;
  }

  async diaryForDate(p: StudentPrincipal, date: string) {
    const principal = this.requireInstitutional(p);
    const [page] = await this.db
      .select()
      .from(schema.studentDiaryPages)
      .where(
        and(
          eq(schema.studentDiaryPages.studentId, principal.studentId),
          eq(schema.studentDiaryPages.pageDate, date),
        ),
      )
      .limit(1);
    if (!page) return { page: null, entries: [] };
    const entries = await this.db
      .select()
      .from(schema.studentDiaryEntries)
      .where(eq(schema.studentDiaryEntries.pageId, page.id))
      .orderBy(asc(schema.studentDiaryEntries.sortOrder));
    return { page, entries };
  }

  async syncDiaryToToday(p: StudentPrincipal, date: string) {
    const { entries } = await this.diaryForDate(p, date);
    const principal = this.requireInstitutional(p);
    const picks = entries.slice(0, 3).map((e, i) => ({
      id: e.id,
      title: e.body.slice(0, 80),
      blockDate: date,
      sortOrder: i,
    }));
    if (picks.length) await this.todaySync.syncTodayBlocks(principal, picks);
    return { synced: picks.length };
  }

  async listClubs(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const conds = [eq(schema.clubs.institutionId, principal.institutionId), eq(schema.clubs.active, true)];
    if (principal.campusId) conds.push(eq(schema.clubs.campusId, principal.campusId));
    return this.db
      .select()
      .from(schema.clubs)
      .where(and(...conds))
      .limit(100);
  }

  async healthMirror(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const [profile] = await this.db
      .select({
        bloodGroup: schema.parentHealthProfiles.bloodGroup,
        allergies: schema.parentHealthProfiles.allergies,
        chronicConditions: schema.parentHealthProfiles.chronicConditions,
        emergencyContacts: schema.parentHealthProfiles.emergencyContacts,
        lastVerifiedAt: schema.parentHealthProfiles.lastVerifiedAt,
      })
      .from(schema.parentHealthProfiles)
      .where(eq(schema.parentHealthProfiles.studentId, principal.studentId))
      .orderBy(desc(schema.parentHealthProfiles.revision))
      .limit(1);
    if (!profile) throw new NotFoundException({ code: 'NO_PROFILE', message: 'No health profile on file.' });
    return profile;
  }

  async outpassStatus(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const now = new Date();
    const rows = await this.db
      .select()
      .from(schema.gatePasses)
      .where(
        and(
          eq(schema.gatePasses.holderStudentId, principal.studentId),
          eq(schema.gatePasses.status, 'active'),
          gte(schema.gatePasses.expiresAt, now),
        ),
      )
      .orderBy(desc(schema.gatePasses.issuedAt))
      .limit(5);
    return { passes: rows };
  }
}
