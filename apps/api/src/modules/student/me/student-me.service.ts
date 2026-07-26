import { Inject, Injectable } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import type { StudentMeDto, StudentPreferencesDto } from '@edrion/schemas';
import { studentPreferencesSchema } from '@edrion/schemas';
import type { StudentPersona } from '@edrion/shared-types';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { SurfacesService } from '../surfaces/surfaces.service';

const DEFAULT_PREFERENCES: StudentPreferencesDto = {
  theme: 'standard',
  matchSystem: false,
  textSize: 'M',
  reducedMotion: false,
  hintGenerosity: 'balanced',
  celebration: 'warm',
  weeklyGoal: 8,
  quietHours: null,
  notifSessionReminders: true,
  notifRevisionDue: true,
  notifAnnouncements: true,
  language: 'en',
  expertMode: false,
};

@Injectable()
export class StudentMeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaces: SurfacesService,
  ) {}

  async getMe(principal: StudentPrincipal): Promise<StudentMeDto> {
    const preferences = await this.loadPreferences(principal);
    const surfaces = await this.surfaces.resolveForPrincipal(principal);
    const portalEnabled = await this.surfaces.isPortalEnabled(principal);

    if (!portalEnabled && principal.kind === 'institutional') {
      // Kill-switch: still return me for diagnostics; guarded routes should 403 separately.
    }

    if (principal.kind === 'independent') {
      return {
        kind: 'independent',
        id: principal.independentUserId,
        fullName: principal.fullName,
        initial: initialOf(principal.fullName),
        permissions: principal.permissions,
        surfaces,
        flags: { expertModeAvailable: true },
        preferences,
        persona: 'independent',
      };
    }

    const [institution, student, classRow, grade] = await Promise.all([
      this.db
        .select({
          id: schema.institutions.id,
          name: schema.institutions.displayName,
          type: schema.institutions.type,
          currency: schema.institutions.currency,
        })
        .from(schema.institutions)
        .where(eq(schema.institutions.id, principal.institutionId))
        .limit(1)
        .then((r) => r[0]),
      this.db
        .select()
        .from(schema.students)
        .where(eq(schema.students.id, principal.studentId))
        .limit(1)
        .then((r) => r[0]),
      this.db
        .select({ name: schema.classes.name })
        .from(schema.students)
        .leftJoin(schema.classes, eq(schema.students.classId, schema.classes.id))
        .where(eq(schema.students.id, principal.studentId))
        .limit(1)
        .then((r) => r[0]),
      this.db
        .select({ name: schema.gradeLevels.name })
        .from(schema.students)
        .leftJoin(schema.gradeLevels, eq(schema.students.gradeLevelId, schema.gradeLevels.id))
        .where(eq(schema.students.id, principal.studentId))
        .limit(1)
        .then((r) => r[0]),
    ]);

    const persona: StudentPersona =
      institution?.type === 'college' || institution?.type === 'university' ? 'college' : 'school';

    return {
      kind: 'institutional',
      id: principal.institutionUserId,
      fullName: principal.fullName,
      initial: initialOf(principal.fullName),
      institution: institution
        ? { id: institution.id, name: institution.name, type: institution.type }
        : undefined,
      campusId: principal.campusId,
      student: student
        ? {
            id: student.id,
            admissionNo: student.admissionNo,
            classId: student.classId,
            className: classRow?.name ?? null,
            gradeLevel: grade?.name ?? null,
            curriculumLabel: null,
          }
        : undefined,
      permissions: principal.permissions,
      surfaces,
      flags: { expertModeAvailable: false },
      preferences,
      persona,
    };
  }

  async getPreferences(principal: StudentPrincipal): Promise<StudentPreferencesDto> {
    return this.loadPreferences(principal);
  }

  async patchPreferences(
    principal: StudentPrincipal,
    patch: Partial<StudentPreferencesDto>,
  ): Promise<StudentPreferencesDto> {
    const parsed = studentPreferencesSchema.partial().parse(patch);
    const existing = await this.findPreferenceRow(principal);
    if (existing) {
      const [updated] = await this.db
        .update(schema.studentPreferences)
        .set({
          theme: parsed.theme ?? existing.theme,
          matchSystem: parsed.matchSystem ?? existing.matchSystem,
          textSize: parsed.textSize ?? existing.textSize,
          reducedMotion: parsed.reducedMotion ?? existing.reducedMotion,
          hintGenerosity: parsed.hintGenerosity ?? existing.hintGenerosity,
          celebration: parsed.celebration ?? existing.celebration,
          weeklyGoal: parsed.weeklyGoal ?? existing.weeklyGoal,
          quietHours: parsed.quietHours !== undefined ? parsed.quietHours : existing.quietHours,
          notifSessionReminders: parsed.notifSessionReminders ?? existing.notifSessionReminders,
          notifRevisionDue: parsed.notifRevisionDue ?? existing.notifRevisionDue,
          notifAnnouncements: parsed.notifAnnouncements ?? existing.notifAnnouncements,
          language: parsed.language ?? existing.language,
          expertMode: parsed.expertMode ?? existing.expertMode,
          version: existing.version + 1,
        })
        .where(eq(schema.studentPreferences.id, existing.id))
        .returning();
      return this.toPreferencesDto(updated!);
    }

    const merged = { ...DEFAULT_PREFERENCES, ...parsed };
    const values =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, ...merged }
        : { independentUserId: principal.independentUserId, ...merged };
    const [created] = await this.db.insert(schema.studentPreferences).values(values).returning();
    return this.toPreferencesDto(created!);
  }

  private async loadPreferences(principal: StudentPrincipal): Promise<StudentPreferencesDto> {
    const row = await this.findPreferenceRow(principal);
    if (row) return this.toPreferencesDto(row);
    return DEFAULT_PREFERENCES;
  }

  private async findPreferenceRow(principal: StudentPrincipal) {
    if (principal.kind === 'institutional') {
      const [row] = await this.db
        .select()
        .from(schema.studentPreferences)
        .where(eq(schema.studentPreferences.studentId, principal.studentId))
        .limit(1);
      return row;
    }
    const [row] = await this.db
      .select()
      .from(schema.studentPreferences)
      .where(eq(schema.studentPreferences.independentUserId, principal.independentUserId))
      .limit(1);
    return row;
  }

  private toPreferencesDto(row: typeof schema.studentPreferences.$inferSelect): StudentPreferencesDto {
    return studentPreferencesSchema.parse({
      theme: row.theme,
      matchSystem: row.matchSystem,
      textSize: row.textSize,
      reducedMotion: row.reducedMotion,
      hintGenerosity: row.hintGenerosity,
      celebration: row.celebration,
      weeklyGoal: row.weeklyGoal,
      quietHours: row.quietHours ?? null,
      notifSessionReminders: row.notifSessionReminders,
      notifRevisionDue: row.notifRevisionDue,
      notifAnnouncements: row.notifAnnouncements,
      language: row.language,
      expertMode: row.expertMode,
    });
  }
}

function initialOf(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return (part?.[0] ?? '?').toUpperCase();
}
