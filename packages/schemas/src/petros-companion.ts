import { z } from 'zod';

export const PETROS_COMPANION_SCHEMA_VERSION = 'petros.companion.v1';

/**
 * Route support registry.
 *
 * `supported`   — a context adapter exists; Petros may claim knowledge of the screen.
 * `unavailable` — Petros is visible but says plainly that he cannot read this screen.
 * `hidden`      — Petros is not mounted at all (exams in progress, payment, dev surfaces).
 *
 * Both the student portal and the API read this table, so a new page cannot silently
 * fall back to `/home`.
 */
export const PETROS_ROUTE_SUPPORT = ['supported', 'unavailable', 'hidden'] as const;
export type PetrosRouteSupport = (typeof PETROS_ROUTE_SUPPORT)[number];

export const PETROS_SURFACES = [
  'home',
  'timetable',
  'attendance',
  'classes',
  'courses',
  'calendar',
  'assignments',
  'homework',
  'materials',
  'learning_path',
  'progress',
  'exams',
  'results',
  'report_cards',
  'fees',
  'announcements',
  'notifications',
  'requests',
  'documents',
  'transport',
  'hostel',
  'profile',
  'settings',
  'petros_artifacts',
  'petros_input_modes',
  'unknown',
] as const;
export type PetrosSurface = (typeof PETROS_SURFACES)[number];

type RouteRule = {
  /** Matched as an exact path or as a `${prefix}/` prefix. */
  prefix: string;
  support: PetrosRouteSupport;
  surface: PetrosSurface;
  label: string;
  /**
   * Why Petros stays quiet. Rendered to the student verbatim on `unavailable`
   * routes so he never pretends to see a screen he cannot read.
   */
  reason?: string;
};

/** Longest prefix wins, so `/fees/pay` is evaluated before `/fees`. */
export const PETROS_ROUTE_RULES: readonly RouteRule[] = [
  { prefix: '/home', support: 'supported', surface: 'home', label: 'Dashboard' },
  { prefix: '/timetable', support: 'supported', surface: 'timetable', label: 'Timetable' },
  { prefix: '/attendance', support: 'supported', surface: 'attendance', label: 'Attendance' },
  { prefix: '/classes', support: 'supported', surface: 'classes', label: 'Classes' },
  { prefix: '/courses', support: 'supported', surface: 'courses', label: 'Courses' },
  { prefix: '/calendar', support: 'supported', surface: 'calendar', label: 'Calendar' },
  { prefix: '/assignments', support: 'supported', surface: 'assignments', label: 'Assignments' },
  { prefix: '/homework', support: 'supported', surface: 'homework', label: 'Homework' },
  { prefix: '/materials', support: 'supported', surface: 'materials', label: 'Study materials' },
  { prefix: '/learning-path', support: 'supported', surface: 'learning_path', label: 'Learning path' },
  { prefix: '/progress', support: 'supported', surface: 'progress', label: 'Learning progress' },
  { prefix: '/results', support: 'supported', surface: 'results', label: 'Results' },
  { prefix: '/report-cards', support: 'supported', surface: 'report_cards', label: 'Report cards' },
  { prefix: '/announcements', support: 'supported', surface: 'announcements', label: 'Announcements' },
  { prefix: '/notifications', support: 'supported', surface: 'notifications', label: 'Notifications' },
  { prefix: '/documents', support: 'supported', surface: 'documents', label: 'Documents' },
  { prefix: '/petros/artifacts', support: 'supported', surface: 'petros_artifacts', label: 'Saved artifacts' },

  // Petros is mounted on the exam list, but never inside an attempt.
  { prefix: '/exams', support: 'supported', surface: 'exams', label: 'Examinations' },
  { prefix: '/exams/attempt', support: 'hidden', surface: 'exams', label: 'Exam attempt' },

  {
    prefix: '/fees',
    support: 'unavailable',
    surface: 'fees',
    label: 'Fees',
    reason: 'I stay out of fees and payments. Your institution office handles those.',
  },
  { prefix: '/fees/pay', support: 'hidden', surface: 'fees', label: 'Fee payment' },
  {
    prefix: '/requests',
    support: 'unavailable',
    surface: 'requests',
    label: 'Requests',
    reason: 'I cannot read your service requests yet, so I would only be guessing.',
  },
  {
    prefix: '/transport',
    support: 'unavailable',
    surface: 'transport',
    label: 'Transport',
    reason: 'Transport details are not connected to me yet.',
  },
  {
    prefix: '/hostel',
    support: 'unavailable',
    surface: 'hostel',
    label: 'Hostel',
    reason: 'Hostel details are not connected to me yet.',
  },
  {
    prefix: '/profile',
    support: 'unavailable',
    surface: 'profile',
    label: 'Profile',
    reason: 'I do not read your profile record. Ask me about your studies instead.',
  },
  {
    prefix: '/settings',
    support: 'unavailable',
    surface: 'settings',
    label: 'Settings',
    reason: 'Settings are yours to change. I can explain an option if you ask.',
  },
  {
    prefix: '/petros',
    support: 'unavailable',
    surface: 'petros_input_modes',
    label: 'Petros',
    reason: 'You are already in my workspace. Use the session tools on this page.',
  },
  { prefix: '/petros/session', support: 'hidden', surface: 'unknown', label: 'Petros session' },
  { prefix: '/design-system', support: 'hidden', surface: 'unknown', label: 'Design system' },
];

const FALLBACK_RULE: RouteRule = {
  prefix: '/',
  support: 'unavailable',
  surface: 'unknown',
  label: 'Student portal',
  reason: 'I do not have this screen connected yet.',
};

/** Strips query/hash, then resolves the longest matching prefix rule. */
export function resolvePetrosRoute(rawRoute: string): RouteRule & { route: string } {
  const route = (rawRoute.split('#')[0] ?? '').split('?')[0] || '/';
  // `/exams/:id/attempt` is the only nested-segment special case in the portal.
  const normalized = /^\/exams\/[^/]+\/attempt$/.test(route) ? '/exams/attempt' : route;
  const match = PETROS_ROUTE_RULES.filter(
    (rule) => normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return { ...(match ?? FALLBACK_RULE), route };
}

export function isPetrosRouteSupported(route: string) {
  return resolvePetrosRoute(route).support === 'supported';
}

/** Entity kinds a candidate may point at. The API resolves each one authoritatively. */
export const PETROS_ENTITY_TYPES = [
  'assignment',
  'homework',
  'exam_schedule',
  'result',
  'report_card',
  'material',
  'document',
  'announcement',
  'notification',
  'timetable_slot',
  'calendar_event',
  'course',
  'class',
  'learning_path_step',
  'reflection_recommendation',
  'artifact',
  'petros_session',
  'attendance_summary',
  'planner_item',
  'screen',
] as const;
export type PetrosEntityType = (typeof PETROS_ENTITY_TYPES)[number];

const shortText = z.string().trim().min(1).max(300);

/**
 * A path inside the student portal.
 *
 * `startsWith('/')` alone is not enough: `//evil.example` is a protocol-relative URL that
 * browsers resolve off-site, so a model-supplied destination could navigate the student
 * away from the portal. Backslashes are rejected for the same reason.
 */
const portalPath = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value.startsWith('/'), 'Must be a portal path')
  .refine((value) => !value.startsWith('//') && !value.startsWith('/\\'), 'Must not leave the portal');

export const petrosPageCandidateSchema = z
  .object({
    /** Stable client reference, unique within a page registration. */
    ref: z.string().trim().min(1).max(160),
    entityType: z.enum(PETROS_ENTITY_TYPES),
    entityId: z.string().trim().min(1).max(240).optional(),
    title: shortText,
    summary: z.string().trim().max(600).default(''),
    href: portalPath.optional(),
    sourceVersion: z.string().trim().min(1).max(120).optional(),
    availableActions: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  })
  .strict();
export type PetrosPageCandidate = z.infer<typeof petrosPageCandidateSchema>;

export const petrosPageContextSchema = z
  .object({
    route: portalPath,
    surface: z.enum(PETROS_SURFACES),
    title: shortText,
    summary: z.string().trim().max(600).optional(),
    candidates: z.array(petrosPageCandidateSchema).max(40).default([]),
    selectedRef: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
export type PetrosPageContext = z.infer<typeof petrosPageContextSchema>;

/* ------------------------------------------------------------------ *
 * Turn contract
 * ------------------------------------------------------------------ */

/**
 * Action keys the model may name. The service owns arguments, permissions,
 * confirmation policy and execution; an unregistered key is rejected outright.
 */
export const PETROS_ACTION_KEYS = [
  'navigate.open',
  'session.preview_and_start',
  'session.resume',
  'planner.create',
  'planner.update',
  'review.open_due',
  'reflection.open_recommendation',
  'artifact.open',
  'teach_back.start',
] as const;
export type PetrosActionKey = (typeof PETROS_ACTION_KEYS)[number];

/** State-changing actions always require an explicit confirmation step. */
export const PETROS_MUTATING_ACTIONS: readonly PetrosActionKey[] = [
  'session.preview_and_start',
  'planner.create',
  'planner.update',
  'teach_back.start',
];

export const PETROS_ACTION_STATUSES = [
  'proposed',
  'confirmed',
  'executed',
  'declined',
  'expired',
  'failed',
] as const;
export type PetrosActionStatus = (typeof PETROS_ACTION_STATUSES)[number];

export const petrosCompanionBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(4_000) }).strict(),
  z
    .object({
      type: z.literal('source'),
      label: shortText,
      href: portalPath.optional(),
      sourceRef: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      type: z.literal('suggested_replies'),
      replies: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(120),
              label: z.string().trim().min(1).max(80),
              payload: z.string().trim().min(1).max(400),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    })
    .strict(),
  z
    .object({
      type: z.literal('navigation'),
      label: shortText,
      href: portalPath,
    })
    .strict(),
  z
    .object({
      type: z.literal('action_proposal'),
      proposalId: z.string().uuid(),
      actionKey: z.enum(PETROS_ACTION_KEYS),
      title: shortText,
      preview: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
      confirmationRequired: z.boolean(),
      status: z.enum(PETROS_ACTION_STATUSES).default('proposed'),
    })
    .strict(),
  z
    .object({
      type: z.literal('session_offer'),
      intentPreviewRef: z.string().trim().min(1).max(240),
      title: shortText,
      minutes: z.number().int().min(5).max(45),
    })
    .strict(),
  z
    .object({
      type: z.literal('plan_preview'),
      title: shortText,
      steps: z
        .array(
          z
            .object({
              label: shortText,
              when: z.string().trim().min(1).max(120).optional(),
              sourceRef: z.string().trim().min(1).max(240).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal('status'),
      label: shortText,
      tone: z.enum(['neutral', 'positive', 'warning']),
    })
    .strict(),
]);
export type PetrosCompanionBlock = z.infer<typeof petrosCompanionBlockSchema>;

export const petrosCompanionTurnInputSchema = z
  .object({
    threadId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2_000),
    route: portalPath,
    surface: z.enum(PETROS_SURFACES),
    focusRef: z.string().trim().min(1).max(160).optional(),
    visibleCandidates: z.array(petrosPageCandidateSchema).max(40).default([]),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosCompanionTurnInput = z.infer<typeof petrosCompanionTurnInputSchema>;

export const PETROS_MESSAGE_ROLES = ['student', 'petros'] as const;

export const petrosCompanionMessageSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    role: z.enum(PETROS_MESSAGE_ROLES),
    blocks: z.array(petrosCompanionBlockSchema).max(20),
    route: z.string().trim().max(500).nullable(),
    surface: z.enum(PETROS_SURFACES).nullable(),
    focusRef: z.string().trim().max(160).nullable(),
    createdAt: z.string(),
  })
  .strict();
export type PetrosCompanionMessage = z.infer<typeof petrosCompanionMessageSchema>;

export const petrosCompanionThreadSchema = z
  .object({
    schemaVersion: z.literal(PETROS_COMPANION_SCHEMA_VERSION),
    id: z.string().uuid(),
    title: z.string().trim().max(160).nullable(),
    activeTopic: z.string().trim().max(160).nullable(),
    status: z.enum(['active', 'archived']),
    lastActivityAt: z.string(),
    messages: z.array(petrosCompanionMessageSchema).max(100),
  })
  .strict();
export type PetrosCompanionThread = z.infer<typeof petrosCompanionThreadSchema>;

export const petrosCompanionTurnResultSchema = z
  .object({
    schemaVersion: z.literal(PETROS_COMPANION_SCHEMA_VERSION),
    threadId: z.string().uuid(),
    studentMessage: petrosCompanionMessageSchema,
    reply: petrosCompanionMessageSchema,
    /** True when the identical idempotency key already produced this turn. */
    replayed: z.boolean(),
  })
  .strict();
export type PetrosCompanionTurnResult = z.infer<typeof petrosCompanionTurnResultSchema>;

export const petrosActionDecisionSchema = z
  .object({
    decision: z.enum(['confirm', 'decline']),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosActionDecisionInput = z.infer<typeof petrosActionDecisionSchema>;

export const petrosActionResultSchema = z
  .object({
    proposalId: z.string().uuid(),
    actionKey: z.enum(PETROS_ACTION_KEYS),
    status: z.enum(PETROS_ACTION_STATUSES),
    /** Where the portal should send the student, when the action produced a destination. */
    href: portalPath.nullable(),
    message: shortText,
  })
  .strict();
export type PetrosActionResult = z.infer<typeof petrosActionResultSchema>;

/* ------------------------------------------------------------------ *
 * Student-controlled companion preferences
 * ------------------------------------------------------------------ */

export const PETROS_RESPONSE_DEPTHS = ['brief', 'balanced', 'thorough'] as const;
export const PETROS_ENERGY_LEVELS = ['calm', 'warm', 'upbeat'] as const;
export const PETROS_HUMOUR_LEVELS = ['off', 'light', 'playful'] as const;

export const petrosCompanionPreferencesSchema = z
  .object({
    preferredName: z.string().trim().max(60).nullable().default(null),
    responseDepth: z.enum(PETROS_RESPONSE_DEPTHS).default('balanced'),
    energy: z.enum(PETROS_ENERGY_LEVELS).default('warm'),
    humour: z.enum(PETROS_HUMOUR_LEVELS).default('light'),
    proactiveCheckIns: z.boolean().default(true),
    language: z.string().trim().min(2).max(12).default('en'),
    quietMode: z.boolean().default(false),
  })
  .strict();
export type PetrosCompanionPreferences = z.infer<typeof petrosCompanionPreferencesSchema>;

export const PETROS_DEFAULT_COMPANION_PREFERENCES: PetrosCompanionPreferences =
  petrosCompanionPreferencesSchema.parse({});

/* ------------------------------------------------------------------ *
 * Deterministic briefing
 * ------------------------------------------------------------------ */

export const PETROS_BRIEFING_KINDS = [
  'active_session',
  'due_work',
  'exam',
  'review',
  'reflection',
  'timetable',
  'feedback',
  'attendance',
  'planner',
] as const;
export type PetrosBriefingKind = (typeof PETROS_BRIEFING_KINDS)[number];

export const petrosBriefingItemSchema = z
  .object({
    kind: z.enum(PETROS_BRIEFING_KINDS),
    title: shortText,
    detail: z.string().trim().max(400),
    href: portalPath.nullable(),
    /** Deterministic score; lower sorts first. Never model-assigned. */
    priority: z.number().int().min(0).max(1_000),
    entityType: z.enum(PETROS_ENTITY_TYPES).nullable(),
    entityId: z.string().trim().max(240).nullable(),
  })
  .strict();
export type PetrosBriefingItem = z.infer<typeof petrosBriefingItemSchema>;

export const petrosBriefingSchema = z
  .object({
    schemaVersion: z.literal(PETROS_COMPANION_SCHEMA_VERSION),
    generatedAt: z.string(),
    headline: shortText,
    items: z.array(petrosBriefingItemSchema).max(8),
    quiet: z.boolean(),
  })
  .strict();
export type PetrosBriefing = z.infer<typeof petrosBriefingSchema>;
