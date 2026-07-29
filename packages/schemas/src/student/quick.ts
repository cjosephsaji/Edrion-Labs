import { z } from 'zod';
import { svgSpecSchema } from './svg-spec';

export const quickAnswerInputSchema = z.object({
  question: z.string().min(1).max(2000),
  from: z.enum(['home', 'drawer', 'explore']).default('home'),
});

export const quickAnswerSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  answerShort: z.string(),
  answerDetail: z.string(),
  visual: svgSpecSchema.nullable().optional(),
  visualOffer: z.boolean(),
  onLearningList: z.boolean(),
  createdAt: z.string().datetime(),
});

export type QuickAnswerInput = z.infer<typeof quickAnswerInputSchema>;
export type QuickAnswerDto = z.infer<typeof quickAnswerSchema>;
