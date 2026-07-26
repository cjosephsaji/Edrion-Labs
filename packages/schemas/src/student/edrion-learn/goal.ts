import { z } from 'zod';

export const selfDeclaredGoalV1Schema = z.object({
  v: z.literal(1),
  statement: z.string().min(1),
  outcome: z.string().optional(),
  constraints: z.array(z.string()).default([]),
  weekly_minutes: z.number().int().positive(),
  target_date: z.string().optional(),
  preferred_days: z.array(z.number().int().min(0).max(6)).optional(),
  default_session_minutes: z.number().int().positive().default(15),
  source: z.enum(['self_declared', 'document', 'prep']).default('self_declared'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type SelfDeclaredGoalV1 = z.infer<typeof selfDeclaredGoalV1Schema>;

const legacyGoalShape = z.object({
  goalStatement: z.string(),
  constraints: z.array(z.string()).optional(),
  weeklyMinutes: z.number().int().positive(),
});

/** Lossless upgrade from pre-orchestrator `learning_paths.goal` blobs. */
export function parseLearningPathGoal(raw: unknown, now = new Date()): SelfDeclaredGoalV1 | null {
  const v1 = selfDeclaredGoalV1Schema.safeParse(raw);
  if (v1.success) return v1.data;

  const legacy = legacyGoalShape.safeParse(raw);
  if (!legacy.success) return null;

  const iso = now.toISOString();
  return {
    v: 1,
    statement: legacy.data.goalStatement,
    constraints: legacy.data.constraints ?? [],
    weekly_minutes: legacy.data.weeklyMinutes,
    default_session_minutes: 15,
    source: 'self_declared',
    created_at: iso,
    updated_at: iso,
  };
}
