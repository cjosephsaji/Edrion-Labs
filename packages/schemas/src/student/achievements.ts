import { z } from 'zod';

export const badgeTierSchema = z.enum(['bronze', 'silver', 'gold']);

export const achievementBadgeDtoSchema = z.object({
  key: z.string(),
  glyph: z.string(),
  name: z.string(),
  sub: z.string(),
  earned: z.boolean(),
  tier: badgeTierSchema.nullable(),
  progress: z.object({ done: z.number(), target: z.number() }).optional(),
  note: z.string().optional(),
});

export const achievementsOverviewSchema = z.object({
  families: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      badges: z.array(achievementBadgeDtoSchema),
    }),
  ),
  earnedCount: z.number().int(),
  total: z.number().int(),
});

export type AchievementsOverviewDto = z.infer<typeof achievementsOverviewSchema>;
