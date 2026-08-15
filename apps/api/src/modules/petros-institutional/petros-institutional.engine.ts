import { createHash } from 'node:crypto';
import {
  PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  PETROS_INSTITUTIONAL_RESOLUTION_VERSION,
  petrosInstitutionPolicyConfigSchema,
  petrosResolvedPolicySchema,
  type PetrosHomeworkMatchInput,
  type PetrosInstitutionPolicyConfig,
  type PetrosPolicyFixture,
  type PetrosResolvedPolicy,
} from '@edrion/schemas';

export interface PolicyVersionRecord {
  id: string;
  institutionId: string;
  campusId: string | null;
  programmeId: string | null;
  gradeId: string | null;
  subjectId: string | null;
  scopeLevel: 'institution' | 'campus' | 'programme' | 'grade' | 'subject';
  version: number;
  status: string;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  config: PetrosInstitutionPolicyConfig;
}

const LEVEL_WEIGHT: Record<PolicyVersionRecord['scopeLevel'], number> = {
  institution: 0,
  campus: 1,
  programme: 2,
  grade: 3,
  subject: 4,
};

const PLATFORM_EXCLUDED = [
  'provider or model identity',
  'hidden chain-of-thought',
  'unsaved artifact drafts',
  'unrelated personal history',
  'credentials and internal routing data',
] as const;

export function defaultInstitutionPolicy(): PetrosInstitutionPolicyConfig {
  return petrosInstitutionPolicyConfigSchema.parse({});
}

export function resolveInstitutionPolicy(input: {
  institutionId: string;
  versions: PolicyVersionRecord[];
  fixture: PetrosPolicyFixture;
  now?: Date;
}): PetrosResolvedPolicy {
  const now = input.now ?? new Date(input.fixture.at ?? Date.now());
  const active = input.versions
    .filter((row) => row.institutionId === input.institutionId)
    .filter((row) => ['published', 'scheduled', 'superseded'].includes(row.status))
    .filter((row) => !row.effectiveFrom || row.effectiveFrom <= now)
    .filter((row) => !row.effectiveUntil || row.effectiveUntil > now)
    .filter((row) => scopeMatches(row, input.fixture))
    .sort((a, b) => LEVEL_WEIGHT[a.scopeLevel] - LEVEL_WEIGHT[b.scopeLevel] || a.version - b.version);
  if (!active.length) throw new Error('No effective Petros policy is available for this institution.');

  let config = defaultInstitutionPolicy();
  for (const row of active) config = mergeConfig(config, row.config);
  config.visibility.teacher.categories = withoutUnsaved(config.visibility.teacher.categories);
  config.visibility.parent.categories = withoutUnsaved(config.visibility.parent.categories);

  const ids = active.map((row) => row.id);
  const disclosure = {
    policyVersionIds: ids,
    stableForSession: true as const,
    homeworkRule: config.homework.enabled
      ? config.homework.disclosure
      : 'Petros does not apply a special homework mode under the current policy.',
    syllabusRule: syllabusDisclosure(config),
    visibleToTeacher: config.visibility.teacher.categories,
    visibleToParent: config.visibility.parent.categories,
    teacherPurpose: config.visibility.teacher.purpose,
    parentPurpose: config.visibility.parent.purpose,
    teacherRetentionDays: config.visibility.teacher.retentionDays,
    parentRetentionDays: config.visibility.parent.retentionDays,
    excludedByPlatform: [...PLATFORM_EXCLUDED],
    plainLanguage: [
      syllabusDisclosure(config),
      config.homework.enabled ? config.homework.disclosure : 'No special homework rule is active.',
      audienceSentence('Teachers', config.visibility.teacher.categories, config.visibility.teacher.retentionDays, config.visibility.teacher.purpose),
      audienceSentence('Parents', config.visibility.parent.categories, config.visibility.parent.retentionDays, config.visibility.parent.purpose),
      'A policy change will apply to your next session; this session keeps the rules shown here.',
    ],
  };
  return petrosResolvedPolicySchema.parse({
    resolutionVersion: PETROS_INSTITUTIONAL_RESOLUTION_VERSION,
    institutionId: input.institutionId,
    policyVersionIds: ids,
    resolvedAt: now.toISOString(),
    stableForSession: true,
    config,
    disclosure,
    precedence: [
      'platform safety and privacy limits',
      'institution policy',
      'campus / programme / grade / subject policy',
      'stable session context',
      `student language and accessibility choices (${input.fixture.language})`,
    ],
  });
}

export function decideSyllabus(input: {
  policy: PetrosResolvedPolicy;
  topicKey: string;
  requestedTopic: string;
  requestedDepth: number;
}) {
  const syllabus = input.policy.config.syllabus;
  const topicAllowed = syllabus.topicKeys.length === 0 || syllabus.topicKeys.includes(input.topicKey);
  const depthAllowed = input.requestedDepth <= syllabus.maxDepth;
  if (topicAllowed && depthAllowed) {
    return {
      decision: 'within_bounds' as const,
      requestedTopic: input.requestedTopic,
      allowedDepth: syllabus.maxDepth,
      teachingShape: 'normal' as const,
      studentMessage: `This topic is inside your institution's approved learning scope.`,
      sourceBoundary: { approvedSourceIds: syllabus.approvedSourceIds, externalSourcesAllowed: syllabus.allowExternalSources },
    };
  }
  if (topicAllowed) {
    return {
      decision: 'depth_limited' as const,
      requestedTopic: input.requestedTopic,
      allowedDepth: syllabus.maxDepth,
      teachingShape: 'bounded_explanation' as const,
      studentMessage: `I can teach this up to the approved depth, then help you use ${syllabus.outsidePathLabel}`,
      sourceBoundary: { approvedSourceIds: syllabus.approvedSourceIds, externalSourcesAllowed: syllabus.allowExternalSources },
    };
  }
  return {
    decision: 'outside_bounds' as const,
    requestedTopic: input.requestedTopic,
    allowedDepth: syllabus.maxDepth,
    teachingShape: 'legitimate_path' as const,
    studentMessage: `That topic is outside the current approved syllabus. I can still help you take the fastest allowed next step: ${syllabus.outsidePathLabel}`,
    sourceBoundary: { approvedSourceIds: syllabus.approvedSourceIds, externalSourcesAllowed: syllabus.allowExternalSources },
  };
}

export function decideHomework(policy: PetrosResolvedPolicy, input: PetrosHomeworkMatchInput) {
  const config = policy.config.homework;
  const now = new Date(input.now).getTime();
  const opens = new Date(input.opensAt).getTime();
  const dueBase = new Date(
    input.extendedUntil ??
      (input.deadlineDate ? endOfDayInTimezone(input.deadlineDate, config.timezone) : input.dueAt),
  ).getTime();
  const closes = dueBase + config.graceMinutes * 60_000;
  const related = input.relationBasisPoints >= config.relationThresholdBasisPoints;
  const statusCovered = config.restrictedStatuses.includes(input.status as 'assigned' | 'late' | 'extended');
  const activeWindow = now >= opens && now <= closes;
  const forced = config.teacherOverrideAllowed && input.teacherOverride === 'force_guidance';
  const allowed = config.teacherOverrideAllowed && input.teacherOverride === 'allow_solution';
  const active = config.enabled && related && statusCovered && activeWindow && (!allowed || forced);
  const reasonCode = !config.enabled ? 'POLICY_DISABLED'
    : !related ? 'UNRELATED'
      : !statusCovered ? `STATUS_${input.status.toUpperCase()}`
        : now < opens ? 'BEFORE_WINDOW'
          : now > closes ? 'AFTER_WINDOW'
            : allowed ? 'TEACHER_OVERRIDE_ALLOW_SOLUTION'
              : forced ? 'TEACHER_OVERRIDE_FORCE_GUIDANCE'
                : 'RELATED_ACTIVE_ASSIGNMENT';
  return {
    assignmentId: input.assignmentId,
    related,
    active,
    mode: active ? 'guided_homework' as const : 'normal' as const,
    allowedMoves: active
      ? ['question', 'hint', 'setup', 'prerequisite_repair', 'critique', 'process_feedback'] as const
      : ['question', 'hint', 'setup', 'prerequisite_repair', 'critique', 'process_feedback', 'worked_solution'] as const,
    finalAnswerAllowed: !active,
    studentMessage: active ? config.disclosure : normalHomeworkMessage(reasonCode),
    correctionAllowed: config.studentCorrectionAllowed,
    reasonCode,
  };
}

export function sanitizeTeacherSummary<T extends Record<string, unknown>>(summary: T): T {
  const forbidden = /provider|model|chain.?of.?thought|private.?note|voice|image|unsaved|api.?key/i;
  return scrub(summary, forbidden) as T;
}

export function buildClassSignal(input: {
  concept: string;
  curriculumArea: string;
  learnerHashes: string[];
  evidenceCount: number;
  uncertaintyBasisPoints: number;
  freshestAt: string;
  suggestedNextStep: string;
  policy: PetrosResolvedPolicy;
}) {
  const uniqueCohort = new Set(input.learnerHashes).size;
  const threshold = input.policy.config.classSignals.minimumCohortSize;
  const suppressed = uniqueCohort < threshold || input.evidenceCount < input.policy.config.classSignals.minimumIndependentEvidence;
  return {
    concept: suppressed ? 'Suppressed until cohort threshold' : input.concept,
    curriculumArea: input.curriculumArea,
    cohortSize: suppressed ? null : uniqueCohort,
    threshold,
    suppressed,
    evidenceCount: suppressed ? 0 : input.evidenceCount,
    uncertaintyBasisPoints: suppressed ? 10_000 : input.uncertaintyBasisPoints,
    freshness: input.freshestAt,
    suggestedNextStep: suppressed ? 'Collect more independent evidence before showing a class signal.' : input.suggestedNextStep,
    rankingIncluded: false as const,
    rawAnswersIncluded: false as const,
    learnerIdentifiersIncluded: false as const,
  };
}

export function sanitizeParentDigest<T extends Record<string, unknown>>(digest: T): T {
  const forbidden = /raw|transcript|private|calibration|ability|teacher.?note|provider|model|chain.?of.?thought|voice|image|answer/i;
  return scrub(digest, forbidden) as T;
}

export function stablePolicyHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function scopeMatches(row: PolicyVersionRecord, fixture: PetrosPolicyFixture): boolean {
  if (row.campusId && row.campusId !== fixture.campusId) return false;
  if (row.programmeId && row.programmeId !== fixture.programmeId) return false;
  if (row.gradeId && row.gradeId !== fixture.gradeId) return false;
  if (row.subjectId && row.subjectId !== fixture.subjectId) return false;
  return true;
}

function mergeConfig(base: PetrosInstitutionPolicyConfig, overlay: PetrosInstitutionPolicyConfig) {
  return petrosInstitutionPolicyConfigSchema.parse({
    syllabus: { ...base.syllabus, ...overlay.syllabus },
    homework: { ...base.homework, ...overlay.homework },
    visibility: {
      ...base.visibility,
      ...overlay.visibility,
      teacher: { ...base.visibility.teacher, ...overlay.visibility.teacher },
      parent: { ...base.visibility.parent, ...overlay.visibility.parent },
    },
    escalation: { ...base.escalation, ...overlay.escalation },
    classSignals: { ...base.classSignals, ...overlay.classSignals },
    digest: { ...base.digest, ...overlay.digest },
  });
}

function withoutUnsaved<T extends string>(categories: T[]): T[] {
  return categories.filter((category) => category !== 'unsaved_artifacts');
}

function syllabusDisclosure(config: PetrosInstitutionPolicyConfig) {
  const source = config.syllabus.allowExternalSources ? 'approved syllabus and permitted external sources' : 'approved syllabus sources only';
  return `Petros stays within ${source}, up to depth ${config.syllabus.maxDepth}. If a request is outside that boundary, it will offer an allowed next path.`;
}

function audienceSentence(audience: string, categories: string[], days: number, purpose: string) {
  return categories.length
    ? `${audience} may see ${categories.join(', ')} for up to ${days} days because: ${purpose}`
    : `${audience} cannot see this session under the current policy.`;
}

function normalHomeworkMessage(reason: string) {
  if (reason === 'UNRELATED') return 'This question does not match an active assignment, so normal teaching applies.';
  if (reason === 'BEFORE_WINDOW') return 'The related assignment window has not opened; normal teaching applies.';
  if (reason === 'AFTER_WINDOW') return 'The related assignment window has ended; normal teaching applies.';
  if (reason.startsWith('STATUS_')) return 'The assignment status does not require guided-homework mode.';
  return 'Normal teaching applies. You can still ask for hints, critique or a worked explanation.';
}

function endOfDayInTimezone(date: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const wallClockUtc = Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999);
  try {
    let instant = wallClockUtc;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(instant));
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second), 999);
      instant -= represented - wallClockUtc;
    }
    return new Date(instant).toISOString();
  } catch {
    return new Date(wallClockUtc).toISOString();
  }
}

function scrub(value: unknown, forbidden: RegExp): unknown {
  if (Array.isArray(value)) return value.map((item) => scrub(item, forbidden));
  if (typeof value === 'string' && forbidden.test(value) && !/\b(?:excluded|never|not included)\b/i.test(value)) {
    return 'Excluded by privacy policy.';
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !forbidden.test(key))
    .map(([key, child]) => [key, scrub(child, forbidden)]));
}

export const POLICY_SCHEMA_VERSION = PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION;
