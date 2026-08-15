import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  and, desc, eq, inArray, isNull, schema, sql, type Database,
} from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import {
  INDIVIDUAL_TERMINOLOGY,
  STUDENT_MODULE_CATALOG,
  STUDENT_PORTAL_PRESETS,
  SUGGESTED_PRESET_BY_INSTITUTION_TYPE,
  TERMINOLOGY_KEYS,
  type StudentModuleKey,
  type StudentPortalPresetKey,
  type TerminologyPack,
} from '@edrion/feature-flags';
import {
  defaultStudentHomePriorities,
  type PutStudentPortalConfigInput,
  type StudentHomePriorityKey,
  type StudentPortalConfigResponse,
} from '@edrion/schemas';
import { ActorType, AuditResult, RiskLevel, type InstitutionType } from '@edrion/shared-types';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { FeatureControlsService } from '../feature-controls/feature-controls.service';
import type { PortalActionContext } from './portal-action-context';
import { basePortalAudit } from './portal-action-context';
import type { StudentPrincipal } from '../student/student.types';

type SettingRow = typeof schema.institutionSettings.$inferSelect;
type ModuleKey = StudentModuleKey;

const MODULE = 'student_portal';
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expires: number; value: StudentPortalConfigResponse }>();

@Injectable()
export class StudentPortalConfigService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly features: FeatureControlsService,
  ) {}

  async getAdmin(ctx: PortalActionContext) {
    const institutionId = ctx.principal.institutionId;
    const [institution, campuses, settings, definitions, planId] = await Promise.all([
      this.db.select({ type: schema.institutions.type }).from(schema.institutions)
        .where(eq(schema.institutions.id, institutionId)).limit(1).then((r) => r[0]),
      this.db.select({ id: schema.campuses.id, name: schema.campuses.name }).from(schema.campuses)
        .where(eq(schema.campuses.institutionId, institutionId)),
      this.loadSettings(institutionId),
      this.loadDefinitions(),
      this.planIdForInstitution(institutionId),
    ]);
    const definitionIds = definitions.map((d) => d.id);
    const assignments = definitionIds.length
      ? await this.db.select().from(schema.featureAssignments)
          .where(inArray(schema.featureAssignments.featureId, definitionIds))
      : [];
    const context = { institutionId, planId: planId ?? undefined };
    const cards = await Promise.all(STUDENT_MODULE_CATALOG.map(async (module) => {
      const definition = definitions.find((d) => d.key === `student.surface.${module.key}`);
      const institutionAssignment = definition
        ? assignments.find((a) => a.featureId === definition.id && a.scope === 'institution' && a.scopeId === institutionId)
        : undefined;
      const [effective, planOnly, dependency] = await Promise.all([
        this.features.resolveByKey(`student.surface.${module.key}`, context),
        this.features.resolveByKey(`student.surface.${module.key}`, { planId: planId ?? undefined }),
        module.requiresInstitutionModule
          ? this.features.resolveByKey(`institution.module.${module.requiresInstitutionModule}`, context)
          : Promise.resolve(null),
      ]);
      return {
        ...module,
        featureFlagKey: `student.surface.${module.key}`,
        value: institutionAssignment?.value ?? definition?.defaultValue ?? module.defaultVisible,
        effective: effective.value,
        planLocked: planOnly.layer === 'assignment' && planOnly.scope === 'plan' && !planOnly.value && !effective.value,
        dependencyMet: dependency?.value ?? true,
        dependencyNoteKey: module.requiresInstitutionModule,
      };
    }));
    const moduleByDefinition = new Map(definitions.map((d) => [d.id, d.key.replace('student.surface.', '')]));
    const campusOverrides = Object.fromEntries(campuses.map((campus) => [
      campus.id,
      Object.fromEntries(assignments
        .filter((a) => a.scope === 'campus' && a.scopeId === campus.id)
        .map((a) => [moduleByDefinition.get(a.featureId), a.value])
        .filter(([key]) => Boolean(key))),
    ]));
    const institutionType = (institution?.type ?? 'school') as InstitutionType;
    const suggested = SUGGESTED_PRESET_BY_INSTITUTION_TYPE[institutionType];
    const revision = this.settingNumber(settings, 'student_portal', 'revision', 0);
    const terminology = this.terminologyFrom(settings, STUDENT_PORTAL_PRESETS[suggested].terminology);
    return {
      catalog: cards,
      settings: {
        revision,
        presetKey: this.setting(settings, 'student_portal', 'preset_key') ?? (revision ? 'custom' : suggested),
        terminology,
        labelOverrides: this.labelOverrides(settings),
        attendanceThreshold: this.settingNumber(settings, 'student_portal', 'attendance_threshold', 75),
        gradingScheme: this.setting(settings, 'student_portal', 'grading_scheme') ?? 'percentage',
        homePriorities: this.homePriorities(settings),
      },
      campuses,
      campusOverrides,
      suggestedPresetKey: suggested,
      presets: STUDENT_PORTAL_PRESETS,
    };
  }

  async save(ctx: PortalActionContext, input: PutStudentPortalConfigInput) {
    const institutionId = ctx.principal.institutionId;
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtext(${'student_portal:' + institutionId}))`);
    const before = await this.getAdmin(ctx);
    if (before.settings.revision !== input.revision) {
      throw new ConflictException({ code: 'CONFIG_STALE', message: 'Portal configuration has changed.' });
    }
    const isInstitution = input.scope === 'institution';
    const campusId = input.scope === 'institution' ? null : input.scope.campus_id;
    if (campusId) {
      const allowed = before.campuses.some((c: { id: string }) => c.id === campusId);
      if (!allowed) throw new ForbiddenException({ code: 'SCOPE_FORBIDDEN', message: 'Campus is outside this institution.' });
    }

    const changedModules: Array<{ key: ModuleKey; from: boolean; to: boolean }> = [];
    for (const module of STUDENT_MODULE_CATALOG) {
      const requested = input.modules[module.key];
      if (requested === undefined) {
        if (isInstitution) throw new BadRequestException({ code: 'MODULE_SET_INCOMPLETE', message: `Missing module ${module.key}` });
        continue;
      }
      const card = before.catalog.find((c: { key: string }) => c.key === module.key);
      if (requested && (card?.planLocked || !card?.dependencyMet)) {
        throw new ForbiddenException({
          code: card?.planLocked ? 'PLAN_LOCKED' : 'MODULE_DEPENDENCY_DISABLED',
          message: card?.planLocked ? 'This surface must be enabled by an Edrion super administrator.' : 'Its institution module is disabled.',
        });
      }
      const definition = await this.definitionFor(module.key);
      const previous = isInstitution
        ? Boolean(card?.value)
        : Boolean(before.campusOverrides[campusId!]?.[module.key] ?? card?.value);
      if (previous !== requested) changedModules.push({ key: module.key, from: previous, to: requested });
      if (!isInstitution && input.cleared_overrides.includes(module.key)) {
        await this.db.delete(schema.featureAssignments).where(and(
          eq(schema.featureAssignments.featureId, definition.id),
          eq(schema.featureAssignments.scope, 'campus'),
          eq(schema.featureAssignments.scopeId, campusId!),
        ));
      } else {
        await this.db.insert(schema.featureAssignments).values({
          featureId: definition.id,
          scope: isInstitution ? 'institution' : 'campus',
          scopeId: isInstitution ? institutionId : campusId,
          value: requested,
          enabled: true,
          setByName: ctx.principal.fullName,
          createdBy: ctx.principal.institutionUserId,
          updatedBy: ctx.principal.institutionUserId,
        }).onConflictDoUpdate({
          target: [schema.featureAssignments.featureId, schema.featureAssignments.scope, schema.featureAssignments.scopeId],
          set: { value: requested, enabled: true, setByName: ctx.principal.fullName, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date(), version: sql`${schema.featureAssignments.version} + 1` },
        });
      }
    }

    const terminologyChanges: Array<{ key: string; from: string; to: string }> = [];
    const labelChanges: Array<{ key: string; from: string | null; to: string | null }> = [];
    let presetKey = before.settings.presetKey as string;
    if (isInstitution) {
      if (!input.terminology) throw new BadRequestException({ code: 'TERMINOLOGY_REQUIRED', message: 'All terminology values are required.' });
      const terminology = input.terminology as TerminologyPack;
      for (const key of TERMINOLOGY_KEYS) {
        const from = before.settings.terminology[key];
        const to = terminology[key];
        if (from !== to) terminologyChanges.push({ key, from, to });
        await this.upsertSetting(institutionId, 'terminology', key, `Terminology: ${key}`, 'string', to, ctx.principal.institutionUserId);
      }
      const nextOverrides = input.label_overrides ?? {};
      const allOverrideKeys = new Set([...Object.keys(before.settings.labelOverrides), ...Object.keys(nextOverrides)]);
      for (const key of allOverrideKeys) {
        const from = before.settings.labelOverrides[key] ?? null;
        const to = nextOverrides[key as ModuleKey] ?? null;
        if (from !== to) labelChanges.push({ key, from, to });
      }
      await this.db.delete(schema.institutionSettings).where(and(
        eq(schema.institutionSettings.institutionId, institutionId),
        isNull(schema.institutionSettings.campusId),
        eq(schema.institutionSettings.category, 'student_portal'),
        sql`${schema.institutionSettings.key} like 'label_override.%'`,
      ));
      for (const [key, value] of Object.entries(nextOverrides)) {
        await this.upsertSetting(institutionId, 'student_portal', `label_override.${key}`, `Student label: ${key}`, 'string', value, ctx.principal.institutionUserId);
      }
      await this.upsertSetting(institutionId, 'student_portal', 'attendance_threshold', 'Attendance threshold', 'number', String(input.attendance_threshold ?? 75), ctx.principal.institutionUserId);
      await this.upsertSetting(institutionId, 'student_portal', 'grading_scheme', 'Grading scheme', 'string', input.grading_scheme ?? 'percentage', ctx.principal.institutionUserId);
      const homePriorities = input.home_priorities ?? before.settings.homePriorities;
      await this.upsertSetting(institutionId, 'student_portal', 'home_priorities', 'Student home priorities', 'json', JSON.stringify(homePriorities), ctx.principal.institutionUserId);
      presetKey = this.detectPreset(input.modules as Record<ModuleKey, boolean>, terminology, nextOverrides, input.attendance_threshold ?? 75, input.grading_scheme ?? 'percentage', homePriorities);
      await this.upsertSetting(institutionId, 'student_portal', 'preset_key', 'Student portal preset', 'string', presetKey, ctx.principal.institutionUserId);
    }
    const nextRevision = input.revision + 1;
    await this.upsertSetting(institutionId, 'student_portal', 'revision', 'Student portal revision', 'number', String(nextRevision), ctx.principal.institutionUserId);

    for (const change of changedModules) await this.audit.logAudit({
      ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      action: 'student_portal.module_toggled', module: MODULE, entityType: 'feature_assignment',
      entityId: change.key, result: AuditResult.Success, riskLevel: RiskLevel.Medium,
      previousState: { value: change.from }, newState: { value: change.to, scope: isInstitution ? 'institution' : 'campus', scopeId: campusId ?? institutionId },
    });
    for (const change of terminologyChanges) await this.audit.logAudit({
      ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      action: 'student_portal.terminology_changed', module: MODULE, entityType: 'institution_setting', entityId: change.key,
      previousState: { value: change.from }, newState: { value: change.to }, result: AuditResult.Success, riskLevel: RiskLevel.Low,
    });
    for (const change of labelChanges) await this.audit.logAudit({
      ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      action: 'student_portal.label_override_changed', module: MODULE, entityType: 'institution_setting', entityId: change.key,
      previousState: { value: change.from }, newState: { value: change.to }, result: AuditResult.Success, riskLevel: RiskLevel.Low,
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      action: 'student_portal.config_saved', module: MODULE, entityType: 'institution_setting', entityId: institutionId,
      previousState: { revision: input.revision }, newState: { revision: nextRevision, presetKey, modules: changedModules.length, terminology: terminologyChanges.length, labels: labelChanges.length },
      result: AuditResult.Success, riskLevel: RiskLevel.Medium,
    });
    this.bustInstitution(institutionId);
    return { revision: nextRevision, presetKey };
  }

  async getForStudent(principal: StudentPrincipal): Promise<StudentPortalConfigResponse> {
    const cacheKey = principal.kind === 'independent'
      ? `independent:${principal.independentUserId}`
      : `institution:${principal.institutionId}:${principal.campusId ?? ''}:${principal.institutionUserId}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;

    const independent = principal.kind === 'independent';
    const institutionId = independent ? null : principal.institutionId;
    const [planId, settings, institution] = await Promise.all([
      independent ? this.planIdForIndependent(principal.independentUserId) : this.planIdForInstitution(principal.institutionId),
      institutionId ? this.loadSettings(institutionId) : Promise.resolve([] as SettingRow[]),
      institutionId
        ? this.db.select({ type: schema.institutions.type }).from(schema.institutions).where(eq(schema.institutions.id, institutionId)).limit(1).then((r) => r[0])
        : Promise.resolve(undefined),
    ]);
    const tier = independent ? 'individual' : institution?.type === 'college' || institution?.type === 'university' ? 'college' : 'school';
    const fallbackPreset = independent ? null : SUGGESTED_PRESET_BY_INSTITUTION_TYPE[(institution?.type ?? 'school') as InstitutionType];
    const terminology = independent
      ? INDIVIDUAL_TERMINOLOGY
      : this.terminologyFrom(settings, STUDENT_PORTAL_PRESETS[fallbackPreset!].terminology);
    const overrides = independent ? {} : this.labelOverrides(settings);
    const context = independent
      ? { independentUserId: principal.independentUserId, planId: planId ?? undefined }
      : { institutionId: principal.institutionId, campusId: principal.campusId ?? undefined, institutionUserId: principal.institutionUserId, planId: planId ?? undefined };
    const modules = [] as StudentPortalConfigResponse['modules'];
    for (const module of STUDENT_MODULE_CATALOG) {
      if (independent && !module.individualCapable) continue;
      if (!independent && (module.key === 'planner' || module.key === 'progress')) continue;
      if (!independent && tier === 'school' && module.minTier === 'college') continue;
      const resolution = await this.features.resolveByKey(`student.surface.${module.key}`, context);
      if (!resolution.value) continue;
      if (!independent && module.requiresInstitutionModule) {
        const dependency = await this.features.resolveByKey(`institution.module.${module.requiresInstitutionModule}`, context);
        if (!dependency.value) continue;
      }
      modules.push({ key: module.key, label: overrides[module.key] ?? module.label, icon: module.icon, category: module.category });
    }
    const revision = institutionId ? this.settingNumber(settings, 'student_portal', 'revision', 0) : 0;
    const fingerprint = createHash('sha256').update(JSON.stringify({ modules, terminology, revision })).digest('hex');
    const value = { modules, terminology, tier, config_fingerprint: fingerprint } as StudentPortalConfigResponse;
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async seedIndependent(independentUserId: string): Promise<void> {
    for (const key of ['learn','library','lab','planner','progress','exam_prep'] as ModuleKey[]) {
      const definition = await this.definitionFor(key);
      await this.db.insert(schema.featureAssignments).values({
        featureId: definition.id, scope: 'independent_user', scopeId: independentUserId,
        value: true, enabled: true, reason: 'Individual student-portal preset',
      }).onConflictDoNothing();
    }
    cache.delete(`independent:${independentUserId}`);
  }

  private async loadDefinitions() {
    const keys = STUDENT_MODULE_CATALOG.map((m) => `student.surface.${m.key}`);
    return this.db.select().from(schema.featureDefinitions).where(inArray(schema.featureDefinitions.key, keys));
  }
  private async definitionFor(key: ModuleKey) {
    const [row] = await this.db.select().from(schema.featureDefinitions)
      .where(eq(schema.featureDefinitions.key, `student.surface.${key}`)).limit(1);
    if (!row) throw new BadRequestException({ code: 'FEATURE_NOT_REGISTERED', message: `Missing student.surface.${key}` });
    return row;
  }
  private async loadSettings(institutionId: string): Promise<SettingRow[]> {
    return this.db.select().from(schema.institutionSettings).where(and(
      eq(schema.institutionSettings.institutionId, institutionId), isNull(schema.institutionSettings.campusId),
      inArray(schema.institutionSettings.category, ['terminology','student_portal']),
    ));
  }
  private setting(rows: SettingRow[], category: string, key: string): string | null {
    return rows.find((r) => r.category === category && r.key === key)?.value ?? null;
  }
  private settingNumber(rows: SettingRow[], category: string, key: string, fallback: number): number {
    const n = Number(this.setting(rows, category, key)); return Number.isFinite(n) ? n : fallback;
  }
  private terminologyFrom(rows: SettingRow[], fallback: TerminologyPack): TerminologyPack {
    return Object.fromEntries(TERMINOLOGY_KEYS.map((key) => [key, this.setting(rows, 'terminology', key) ?? fallback[key]])) as TerminologyPack;
  }
  private labelOverrides(rows: SettingRow[]): Record<string, string> {
    return Object.fromEntries(rows.filter((r) => r.category === 'student_portal' && r.key.startsWith('label_override.') && r.value)
      .map((r) => [r.key.slice('label_override.'.length), r.value!]));
  }
  private homePriorities(rows: SettingRow[]): Record<StudentHomePriorityKey, number> {
    const raw = this.setting(rows, 'student_portal', 'home_priorities');
    if (!raw) return { ...defaultStudentHomePriorities };
    try {
      const parsed = JSON.parse(raw) as Partial<Record<StudentHomePriorityKey, unknown>>;
      return Object.fromEntries(Object.entries(defaultStudentHomePriorities).map(([key, fallback]) => {
        const value = Number(parsed[key as StudentHomePriorityKey]);
        return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback];
      })) as Record<StudentHomePriorityKey, number>;
    } catch {
      return { ...defaultStudentHomePriorities };
    }
  }
  private async upsertSetting(institutionId: string, category: string, key: string, label: string, valueType: string, value: string, actor: string) {
    const [existing] = await this.db.select().from(schema.institutionSettings).where(and(
      eq(schema.institutionSettings.institutionId, institutionId), isNull(schema.institutionSettings.campusId),
      eq(schema.institutionSettings.category, category), eq(schema.institutionSettings.key, key),
    )).limit(1);
    if (existing) await this.db.update(schema.institutionSettings).set({ value, valueType, label, updatedBy: actor, updatedAt: new Date(), version: existing.version + 1 }).where(eq(schema.institutionSettings.id, existing.id));
    else await this.db.insert(schema.institutionSettings).values({ institutionId, category, key, label, valueType, value, createdBy: actor });
  }
  private detectPreset(modules: Record<ModuleKey, boolean>, terminology: TerminologyPack, overrides: Record<string, string>, threshold: number, scheme: string, homePriorities: Partial<Record<StudentHomePriorityKey, number>>): StudentPortalPresetKey | 'custom' {
    if (Object.keys(overrides).length) return 'custom';
    if (Object.entries(defaultStudentHomePriorities).some(([key, value]) => (homePriorities[key as StudentHomePriorityKey] ?? value) !== value)) return 'custom';
    for (const preset of Object.values(STUDENT_PORTAL_PRESETS)) {
      if (preset.defaults.attendanceThreshold !== threshold || preset.defaults.gradingScheme !== scheme) continue;
      if (STUDENT_MODULE_CATALOG.some((m) => modules[m.key] !== preset.modules[m.key])) continue;
      if (TERMINOLOGY_KEYS.some((key) => terminology[key] !== preset.terminology[key])) continue;
      return preset.key;
    }
    return 'custom';
  }
  private async planIdForInstitution(institutionId: string): Promise<string | null> {
    const [row] = await this.db.select({ planId: schema.planVersions.planId }).from(schema.subscriptions)
      .innerJoin(schema.planVersions, eq(schema.subscriptions.planVersionId, schema.planVersions.id))
      .where(eq(schema.subscriptions.institutionId, institutionId)).orderBy(desc(schema.subscriptions.updatedAt)).limit(1);
    return row?.planId ?? null;
  }
  private async planIdForIndependent(independentUserId: string): Promise<string | null> {
    const [row] = await this.db.select({ planId: schema.planVersions.planId }).from(schema.subscriptions)
      .innerJoin(schema.planVersions, eq(schema.subscriptions.planVersionId, schema.planVersions.id))
      .where(eq(schema.subscriptions.independentUserId, independentUserId)).orderBy(desc(schema.subscriptions.updatedAt)).limit(1);
    return row?.planId ?? null;
  }
  private bustInstitution(institutionId: string) {
    for (const key of cache.keys()) if (key.startsWith(`institution:${institutionId}:`)) cache.delete(key);
  }
}
