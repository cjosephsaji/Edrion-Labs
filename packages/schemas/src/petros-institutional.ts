import { z } from 'zod';
import { petrosKnowledgeModeSchema } from './petros-knowledge-policy';

export const PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION = 'petros.institutional.policy.v1';
export const PETROS_INSTITUTIONAL_RESOLUTION_VERSION = 'petros.institutional.resolve.v1';
export const PETROS_INSTITUTIONAL_FUNCTIONS = {
  teacherEscalation: 'institution.teacher_escalation_summary.generate',
  parentDigest: 'institution.parent_digest.generate',
} as const;

export const petrosPolicyScopeSchema = z.object({
  level: z.enum(['institution', 'campus', 'programme', 'grade', 'subject']),
  campusId: z.string().uuid().nullable().default(null),
  programmeId: z.string().uuid().nullable().default(null),
  gradeId: z.string().uuid().nullable().default(null),
  subjectId: z.string().uuid().nullable().default(null),
}).strict().superRefine((value, ctx) => {
  const required = value.level === 'campus' ? 'campusId'
    : value.level === 'programme' ? 'programmeId'
      : value.level === 'grade' ? 'gradeId'
        : value.level === 'subject' ? 'subjectId'
          : null;
  if (required && !value[required]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [required], message: `${required} is required for ${value.level} scope.` });
  }
  if (value.level === 'institution' && [value.campusId, value.programmeId, value.gradeId, value.subjectId].some(Boolean)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['level'], message: 'Institution scope cannot include narrower identifiers.' });
  }
  if (value.level === 'campus' && [value.programmeId, value.gradeId, value.subjectId].some(Boolean)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['level'], message: 'Campus scope cannot include programme, grade, or subject identifiers.' });
  }
  if (value.level === 'programme' && [value.gradeId, value.subjectId].some(Boolean)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['level'], message: 'Programme scope cannot include grade or subject identifiers.' });
  }
  if (value.level === 'grade' && value.subjectId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['level'], message: 'Grade scope cannot include a subject identifier.' });
  }
});

export const petrosSyllabusPolicySchema = z.object({
  approvedSourceIds: z.array(z.string().min(1).max(160)).max(100).default([]),
  grades: z.array(z.string().min(1).max(120)).max(50).default([]),
  subjects: z.array(z.string().min(1).max(120)).max(100).default([]),
  topicKeys: z.array(z.string().min(1).max(160)).max(2_000).default([]),
  maxDepth: z.number().int().min(0).max(10).default(3),
  allowExternalSources: z.boolean().default(false),
  knowledgeMode: petrosKnowledgeModeSchema.optional(),
  outsidePathLabel: z.string().trim().min(8).max(300).default('Ask your teacher for an approved source, or choose a related syllabus topic.'),
}).strict();

export const petrosHomeworkPolicySchema = z.object({
  enabled: z.boolean().default(true),
  graceMinutes: z.number().int().min(0).max(10_080).default(0),
  timezone: z.string().min(1).max(80).default('UTC'),
  relationThresholdBasisPoints: z.number().int().min(5_000).max(10_000).default(7_000),
  restrictedStatuses: z.array(z.enum(['assigned', 'late', 'extended'])).default(['assigned', 'late', 'extended']),
  teacherOverrideAllowed: z.boolean().default(true),
  studentCorrectionAllowed: z.boolean().default(true),
  disclosure: z.string().trim().min(8).max(400).default('While related homework is active, Petros will use questions, hints, setup and feedback instead of giving the final answer.'),
}).strict();

export const petrosVisibilityCategorySchema = z.enum([
  'session_metadata',
  'concept_and_goal',
  'attempt_summary',
  'teacher_handoff',
  'raw_transcript',
  'private_questions',
  'voice_recording',
  'images',
  'unsaved_artifacts',
]);

export const petrosAudienceVisibilitySchema = z.object({
  categories: z.array(petrosVisibilityCategorySchema).max(9).default([]),
  retentionDays: z.number().int().min(1).max(3_650).default(30),
  purpose: z.string().trim().min(8).max(300),
}).strict();

export const petrosVisibilityPolicySchema = z.object({
  teacher: petrosAudienceVisibilitySchema.default({ categories: ['session_metadata', 'concept_and_goal', 'attempt_summary', 'teacher_handoff'], retentionDays: 90, purpose: 'Give the assigned teacher enough context to support learning.' }),
  parent: petrosAudienceVisibilitySchema.default({ categories: ['session_metadata', 'concept_and_goal'], retentionDays: 30, purpose: 'Share a limited learning progress summary with a linked guardian.' }),
  requireStudentConsentForContent: z.boolean().default(true),
}).strict();

export const petrosEscalationPolicySchema = z.object({
  enabled: z.boolean().default(true),
  offerAfterFailedRepairCount: z.number().int().min(1).max(10).default(3),
  studentCanEdit: z.boolean().default(true),
  requireConsent: z.boolean().default(true),
  cancellationMinutes: z.number().int().min(0).max(1_440).default(10),
}).strict();

export const petrosClassSignalPolicySchema = z.object({
  enabled: z.boolean().default(true),
  minimumCohortSize: z.number().int().min(5).max(100).default(8),
  minimumIndependentEvidence: z.number().int().min(2).max(100).default(3),
  freshnessDays: z.number().int().min(1).max(365).default(30),
}).strict();

export const petrosDigestPolicySchema = z.object({
  enabled: z.boolean().default(false),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly']).default('weekly'),
  preferredLanguage: z.string().min(2).max(35).default('en'),
  permittedSections: z.array(z.enum(['work_completed', 'concepts_building', 'support_ideas', 'upcoming_review', 'effort_and_strategy'])).max(5).default(['work_completed', 'concepts_building', 'support_ideas', 'upcoming_review', 'effort_and_strategy']),
  deliveryChannels: z.array(z.enum(['portal', 'email'])).min(1).max(2).default(['portal']),
  maxRetries: z.number().int().min(0).max(10).default(3),
}).strict();

export const petrosInstitutionPolicyConfigSchema = z.object({
  syllabus: petrosSyllabusPolicySchema.default({}),
  homework: petrosHomeworkPolicySchema.default({}),
  visibility: petrosVisibilityPolicySchema.default({}),
  escalation: petrosEscalationPolicySchema.default({}),
  classSignals: petrosClassSignalPolicySchema.default({}),
  digest: petrosDigestPolicySchema.default({}),
}).strict();
export type PetrosInstitutionPolicyConfig = z.infer<typeof petrosInstitutionPolicyConfigSchema>;

export const petrosPolicyVersionSchema = z.object({
  id: z.string().uuid(),
  institutionId: z.string().uuid(),
  scope: petrosPolicyScopeSchema,
  version: z.number().int().positive(),
  status: z.enum(['draft', 'scheduled', 'published', 'superseded', 'rolled_back']),
  schemaVersion: z.literal(PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION),
  config: petrosInstitutionPolicyConfigSchema,
  reason: z.string().min(3).max(1_000),
  authorId: z.string().uuid(),
  effectiveFrom: z.string().datetime().nullable(),
  effectiveUntil: z.string().datetime().nullable(),
  supersedesId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
}).strict();

export const petrosPolicyDraftInputSchema = z.object({
  scope: petrosPolicyScopeSchema,
  config: petrosInstitutionPolicyConfigSchema,
  reason: z.string().trim().min(3).max(1_000),
  effectiveFrom: z.string().datetime().nullable().default(null),
  effectiveUntil: z.string().datetime().nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveFrom && value.effectiveUntil && value.effectiveUntil <= value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'Effective end must be after the start.' });
  }
});
export type PetrosPolicyDraftInput = z.infer<typeof petrosPolicyDraftInputSchema>;

export const petrosPolicyDraftUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  scope: petrosPolicyScopeSchema,
  config: petrosInstitutionPolicyConfigSchema,
  reason: z.string().trim().min(3).max(1_000),
  effectiveFrom: z.string().datetime().nullable().default(null),
  effectiveUntil: z.string().datetime().nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveFrom && value.effectiveUntil && value.effectiveUntil <= value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'Effective end must be after the start.' });
  }
});
export type PetrosPolicyDraftUpdateInput = z.infer<typeof petrosPolicyDraftUpdateSchema>;

export const petrosPolicyPublishInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1_000),
  confirmDisclosureReviewed: z.literal(true),
}).strict();
export type PetrosPolicyPublishInput = z.infer<typeof petrosPolicyPublishInputSchema>;

export const petrosPolicyRollbackInputSchema = z.object({
  targetVersionId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1_000),
  confirm: z.literal('ROLL BACK PETROS POLICY'),
}).strict();
export type PetrosPolicyRollbackInput = z.infer<typeof petrosPolicyRollbackInputSchema>;

export const petrosPolicyFixtureSchema = z.object({
  campusId: z.string().uuid().nullable().default(null),
  programmeId: z.string().uuid().nullable().default(null),
  gradeId: z.string().uuid().nullable().default(null),
  subjectId: z.string().uuid().nullable().default(null),
  studentId: z.string().uuid().nullable().default(null),
  language: z.string().min(2).max(35).default('en'),
  accessibility: z.array(z.string().min(1).max(80)).max(20).default([]),
  at: z.string().datetime().optional(),
}).strict();
export type PetrosPolicyFixture = z.infer<typeof petrosPolicyFixtureSchema>;

export const petrosStudentDisclosureSchema = z.object({
  policyVersionIds: z.array(z.string().uuid()).min(1),
  stableForSession: z.literal(true),
  homeworkRule: z.string().min(1),
  syllabusRule: z.string().min(1),
  visibleToTeacher: z.array(petrosVisibilityCategorySchema),
  visibleToParent: z.array(petrosVisibilityCategorySchema),
  teacherPurpose: z.string().min(1),
  parentPurpose: z.string().min(1),
  teacherRetentionDays: z.number().int().positive(),
  parentRetentionDays: z.number().int().positive(),
  excludedByPlatform: z.array(z.string().min(1)),
  plainLanguage: z.array(z.string().min(1)).min(3),
}).strict();

export const petrosResolvedPolicySchema = z.object({
  resolutionVersion: z.literal(PETROS_INSTITUTIONAL_RESOLUTION_VERSION),
  institutionId: z.string().uuid(),
  policyVersionIds: z.array(z.string().uuid()).min(1),
  resolvedAt: z.string().datetime(),
  stableForSession: z.literal(true),
  config: petrosInstitutionPolicyConfigSchema,
  disclosure: petrosStudentDisclosureSchema,
  precedence: z.array(z.string()).min(5),
}).strict();
export type PetrosResolvedPolicy = z.infer<typeof petrosResolvedPolicySchema>;

export const petrosSyllabusDecisionSchema = z.object({
  decision: z.enum(['within_bounds', 'depth_limited', 'outside_bounds']),
  requestedTopic: z.string().min(1),
  allowedDepth: z.number().int().nonnegative(),
  teachingShape: z.enum(['normal', 'bounded_explanation', 'legitimate_path']),
  studentMessage: z.string().min(8),
  sourceBoundary: z.object({ approvedSourceIds: z.array(z.string()), externalSourcesAllowed: z.boolean() }),
}).strict();

export const petrosHomeworkMatchInputSchema = z.object({
  assignmentId: z.string().uuid(),
  topic: z.string().min(1).max(240),
  subjectId: z.string().uuid().nullable(),
  relationBasisPoints: z.number().int().min(0).max(10_000),
  status: z.enum(['assigned', 'submitted', 'late', 'extended', 'graded', 'missing']),
  opensAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  deadlineDate: z.string().date().nullable().default(null),
  extendedUntil: z.string().datetime().nullable(),
  teacherOverride: z.enum(['inherit', 'allow_solution', 'force_guidance']).default('inherit'),
  now: z.string().datetime(),
}).strict();
export type PetrosHomeworkMatchInput = z.infer<typeof petrosHomeworkMatchInputSchema>;

export const petrosHomeworkCorrectionSchema = z.object({
  assignmentId: z.string().uuid(),
  correctionReason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
}).strict();
export type PetrosHomeworkCorrectionInput = z.infer<typeof petrosHomeworkCorrectionSchema>;

export const petrosHomeworkDecisionSchema = z.object({
  assignmentId: z.string().uuid(),
  related: z.boolean(),
  active: z.boolean(),
  mode: z.enum(['normal', 'guided_homework']),
  allowedMoves: z.array(z.enum(['question', 'hint', 'setup', 'prerequisite_repair', 'critique', 'process_feedback', 'worked_solution'])),
  finalAnswerAllowed: z.boolean(),
  studentMessage: z.string().min(1),
  correctionAllowed: z.boolean(),
  reasonCode: z.string().min(1),
}).strict();

export const petrosTeacherHandoffDraftSchema = z.object({
  concept: z.string().trim().min(2).max(240),
  goal: z.string().trim().min(2).max(500),
  whatWasTried: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  observedBreakPoint: z.string().trim().min(2).max(700),
  evidence: z.array(z.object({ label: z.string().min(1).max(160), sourceEventId: z.string().min(1).max(160) }).strict()).max(20),
  usefulTeacherNextStep: z.string().trim().min(2).max(700),
}).strict();

export const petrosTeacherHandoffCreateSchema = z.object({
  sessionId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  summary: petrosTeacherHandoffDraftSchema,
  idempotencyKey: z.string().uuid(),
}).strict();
export type PetrosTeacherHandoffCreateInput = z.infer<typeof petrosTeacherHandoffCreateSchema>;

export const petrosTeacherHandoffUpdateSchema = z.object({
  action: z.enum(['edit', 'consent', 'deliver', 'cancel', 'withdraw']),
  summary: petrosTeacherHandoffDraftSchema.optional(),
  idempotencyKey: z.string().uuid(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'edit' && !value.summary) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary'], message: 'Edited summary is required.' });
});
export type PetrosTeacherHandoffUpdateInput = z.infer<typeof petrosTeacherHandoffUpdateSchema>;

export const petrosParentDigestPreferenceSchema = z.object({
  studentId: z.string().uuid(),
  optedOut: z.boolean(),
  language: z.string().min(2).max(35),
  deliveryChannels: z.array(z.enum(['portal', 'email'])).min(1).max(2),
}).strict();
export type PetrosParentDigestPreferenceInput = z.infer<typeof petrosParentDigestPreferenceSchema>;

export const petrosParentDigestCommandSchema = z.object({
  studentId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  language: z.string().min(2).max(35),
  action: z.enum(['preview', 'send', 'retry', 'cancel']),
  digestId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid(),
}).strict().refine((value) => value.periodEnd > value.periodStart, { path: ['periodEnd'], message: 'Period end must be after its start.' });
export type PetrosParentDigestCommandInput = z.infer<typeof petrosParentDigestCommandSchema>;

export const petrosInstitutionalDashboardQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();
export type PetrosInstitutionalDashboardQuery = z.infer<typeof petrosInstitutionalDashboardQuerySchema>;

export const petrosInstitutionalReleaseGateSchema = z.object({
  stage9PhysicalDeviceAcceptancePassed: z.literal(false),
  stage10HumanRepeatUsePassed: z.literal(false),
  stage11HumanReflectionAcceptancePassed: z.literal(false),
  stage12CrossRoleHumanAcceptancePassed: z.literal(false),
  voiceRequired: z.literal(false),
  productionReady: z.literal(false),
}).strict();
