import { z } from 'zod';

export const selfDeclaredGoalSourceSchema = z.enum(['self_declared', 'document', 'prep']);

export const selfDeclaredGoalV1Schema = z.object({
  v: z.literal(1),
  statement: z.string().min(1).max(2000),
  outcome: z.string().max(500).optional(),
  constraints: z.array(z.string().max(500)).max(20).default([]),
  weekly_minutes: z.number().int().min(15).max(600),
  target_date: z.string().date().optional(),
  preferred_days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  default_session_minutes: z.number().int().min(5).max(120).default(15),
  source: selfDeclaredGoalSourceSchema.default('self_declared'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type SelfDeclaredGoalV1 = z.infer<typeof selfDeclaredGoalV1Schema>;

const legacyGoalShapeSchema = z.object({
  goalStatement: z.string().optional(),
  constraints: z.union([z.string(), z.array(z.string())]).optional(),
  weeklyMinutes: z.number().int().optional(),
});

/** Parse learning_paths.goal jsonb — accepts v1 or legacy {goalStatement,constraints,weeklyMinutes}. */
export function parseLearningPathGoal(raw: unknown): SelfDeclaredGoalV1 | null {
  if (raw == null) return null;
  const v1 = selfDeclaredGoalV1Schema.safeParse(raw);
  if (v1.success) return v1.data;

  const legacy = legacyGoalShapeSchema.safeParse(raw);
  if (!legacy.success) return null;

  const now = new Date().toISOString();
  const constraints = Array.isArray(legacy.data.constraints)
    ? legacy.data.constraints
    : legacy.data.constraints
      ? [legacy.data.constraints]
      : [];

  return selfDeclaredGoalV1Schema.parse({
    v: 1,
    statement: legacy.data.goalStatement ?? '',
    constraints,
    weekly_minutes: legacy.data.weeklyMinutes ?? 60,
    default_session_minutes: 15,
    source: 'self_declared',
    created_at: now,
    updated_at: now,
  });
}

export function toSelfDeclaredGoalV1(input: {
  statement: string;
  outcome?: string;
  constraints?: string[];
  weeklyMinutes?: number;
  targetDate?: string;
  preferredDays?: number[];
  defaultSessionMinutes?: number;
  source?: z.infer<typeof selfDeclaredGoalSourceSchema>;
}): SelfDeclaredGoalV1 {
  const now = new Date().toISOString();
  return selfDeclaredGoalV1Schema.parse({
    v: 1,
    statement: input.statement,
    outcome: input.outcome,
    constraints: input.constraints ?? [],
    weekly_minutes: input.weeklyMinutes ?? 60,
    target_date: input.targetDate,
    preferred_days: input.preferredDays,
    default_session_minutes: input.defaultSessionMinutes ?? 15,
    source: input.source ?? 'self_declared',
    created_at: now,
    updated_at: now,
  });
}
