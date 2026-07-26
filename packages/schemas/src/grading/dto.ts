import { z } from 'zod';

export const studentTermResultsQuerySchema = z.object({
  term_id: z.string().uuid().optional(),
});

export const studentComponentDetailQuerySchema = z.object({
  subject_id: z.string().uuid(),
  term_id: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const revaluationApproveFormSchema = z.object({
  new_score: z.number().int().min(0),
  note: z.string().trim().min(10).max(500),
});

export type StudentTermResultsQuery = z.infer<typeof studentTermResultsQuerySchema>;
export type StudentComponentDetailQuery = z.infer<typeof studentComponentDetailQuerySchema>;
export type RevaluationApproveForm = z.infer<typeof revaluationApproveFormSchema>;
