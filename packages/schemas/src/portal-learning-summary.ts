import { z } from 'zod';
import { statFromSchema } from './student/homework';

export const learningSummarySchema = z.object({
  topicsCompleted: statFromSchema,
  weeklyGoalProgress: statFromSchema,
  evidenceTags: z.array(z.string()),
  sharedWith: z.array(z.string()),
  neverShared: z.array(z.string()),
});

export type LearningSummaryDto = z.infer<typeof learningSummarySchema>;
