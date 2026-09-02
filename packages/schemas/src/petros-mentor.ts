import { z } from 'zod';
import { PETROS_ENTITY_TYPES } from './petros-companion';

export const petrosMentorPreferencesSchema = z.object({
  guidance: z.enum(['full', 'normal', 'minimal']).default('normal'),
  animate: z.boolean().default(true),
  mutedUntil: z.string().datetime().nullable().default(null),
  tourCompleted: z.boolean().default(false),
}).strict();
export type PetrosMentorPreferences = z.infer<typeof petrosMentorPreferencesSchema>;

export const petrosMentorAvailabilitySchema = z.object({
  date: z.string().date(),
  minutes: z.number().int().min(5).max(480),
}).strict();
export const petrosMentorPlanInputSchema = z.object({
  minutes: z.number().int().min(5).max(240).default(45),
  energy: z.enum(['normal', 'low']).default('normal'),
  availability: z.array(petrosMentorAvailabilitySchema).max(7).refine((days) => new Set(days.map((day) => day.date)).size === days.length, 'Use each date only once.').default([]),
}).strict();
export type PetrosMentorPlanInput = z.infer<typeof petrosMentorPlanInputSchema>;

export const petrosMentorFeedbackSchema = z.object({
  key: z.string().min(1).max(240),
  decision: z.enum(['started', 'postponed', 'skipped']),
}).strict();
export type PetrosMentorFeedback = z.infer<typeof petrosMentorFeedbackSchema>;
export const petrosMentorStateSchema = z.object({
  preferences: petrosMentorPreferencesSchema.default({}),
  plan: petrosMentorPlanInputSchema.default({}),
  planConfirmed: z.boolean().default(false),
  history: z.array(petrosMentorFeedbackSchema.extend({ at: z.string().datetime() })).max(80).default([]),
}).strict();
export type PetrosMentorState = z.infer<typeof petrosMentorStateSchema>;

export type PetrosMentorPriority = {
  key: string;
  kind: 'work' | 'exam' | 'practice' | 'session' | 'review' | 'attendance' | 'planner';
  title: string;
  reason: string;
  href: string;
  entityType: typeof PETROS_ENTITY_TYPES[number] | null;
  entityId: string | null;
  deadlineAt: string | null;
  subject: string | null;
  /** Suggested focus block, not a prediction of task completion. */
  minutes: number;
  score: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  factors: string[];
  previousDecision: PetrosMentorFeedback['decision'] | null;
};
export type PetrosMentorPlanStep = {
  key: string;
  priorityKey: string | null;
  date: string;
  title: string;
  minutes: number;
  kind: 'focus' | 'break';
  href: string | null;
};
export type PetrosMentorDecision = {
  generatedAt: string;
  proactiveAllowed: boolean;
  timeZone: string;
  preferences: PetrosMentorPreferences;
  planInput: PetrosMentorPlanInput;
  planConfirmed: boolean;
  status: 'ready' | 'partial';
  unavailable: string[];
  message: string;
  mood: 'waiting' | 'pointing' | 'urgent' | 'encouraging' | 'celebrating';
  priorities: PetrosMentorPriority[];
  resources: Array<{ priorityKey: string; materialId: string; title: string; reason: string; pageCount: number | null; href: string }>;
  plan: PetrosMentorPlanStep[];
  nextCheck: string | null;
  momentum: { completedToday: number; practicedMinutesToday: number; activeMinutes: number; lastActivityAt: string | null };
  learning: { solid: number; needsPractice: number; untouched: number; evidenceCurrent: boolean } | null;
};
