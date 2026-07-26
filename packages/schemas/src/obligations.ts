import { z } from 'zod';

export const obligationKindSchema = z.enum(['assignment','homework','review_queue','mock','fee_installment','exam','study_block','custom']);
export const normalizeObligationKind = (kind: string): z.infer<typeof obligationKindSchema> => obligationKindSchema.safeParse(kind).success ? kind as z.infer<typeof obligationKindSchema> : 'custom';
export const obligationSchema = z.object({
  id: z.string().min(1), origin: z.enum(['institution','self']), kind: obligationKindSchema,
  title: z.string().min(1).max(120), subtitle: z.string().max(200).optional(), due_at: z.string().datetime(),
  all_day: z.boolean(), status: z.enum(['pending','done','dismissed','expired']),
  action: z.object({ label: z.string().min(1).max(40), deep_link: z.string().min(1) }),
  urgency_override: z.literal('ribbon').optional(),
  progress: z.object({ current: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).optional(),
  source_module: z.string().min(1), updated_at: z.string().datetime(),
  version: z.number().int().nonnegative().optional(),
});
export type Obligation = z.infer<typeof obligationSchema>;

export const createUserObligationSchema = z.object({
  kind: z.enum(['study_block','mock','review','custom']), title: z.string().trim().min(1).max(120),
  due_at: z.string().datetime(), all_day: z.boolean().default(false), deep_link: z.string().startsWith('/').max(300).optional(),
});
export const updateUserObligationSchema = z.object({
  version: z.number().int().nonnegative(), title: z.string().trim().min(1).max(120).optional(), due_at: z.string().datetime().optional(),
  all_day: z.boolean().optional(), deep_link: z.string().startsWith('/').max(300).nullable().optional(), status: z.enum(['pending','done']).optional(),
});
export const updateTodayPreferencesSchema = z.object({
  version: z.number().int().nonnegative(), home_stat_chips: z.array(z.enum(['attendance_pct','gpa_term','streak','review_due_count','fees_balance','mock_percentile'])).max(3).optional(),
  module_notifications: z.record(z.boolean()).optional(), ribbon_dismissed_ids: z.array(z.string().max(180)).max(200).optional(),
  quiet_hours_override: z.object({ start:z.string().regex(/^\d{2}:\d{2}$/),end:z.string().regex(/^\d{2}:\d{2}$/) }).nullable().optional(),
});
export type CreateUserObligationInput = z.infer<typeof createUserObligationSchema>;
export type UpdateUserObligationInput = z.infer<typeof updateUserObligationSchema>;
export type UpdateTodayPreferencesInput = z.infer<typeof updateTodayPreferencesSchema>;

export const KIND_PRIORITY: Record<z.infer<typeof obligationKindSchema>, number> = { exam:0,fee_installment:1,assignment:2,homework:3,mock:4,review_queue:5,study_block:6,custom:7 };

export function compareObligations(a: Obligation, b: Obligation): number {
  const status = Number(a.status !== 'pending') - Number(b.status !== 'pending');
  return status || Date.parse(a.due_at)-Date.parse(b.due_at) || Number(a.origin==='self')-Number(b.origin==='self') || KIND_PRIORITY[a.kind]-KIND_PRIORITY[b.kind] || a.id.localeCompare(b.id);
}

export function mergeObligations(rows: Obligation[]): Obligation[] {
  const byId=new Map<string,Obligation>();
  for(const row of rows){const prior=byId.get(row.id);if(!prior||Date.parse(row.updated_at)>Date.parse(prior.updated_at))byId.set(row.id,row);}
  const liveReviewDates=new Set([...byId.values()].filter(row=>row.id.startsWith('self:review_queue:')).map(row=>row.id.split(':').at(-1)).filter((value):value is string=>Boolean(value)));
  return [...byId.values()].filter(row=>!(row.origin==='self'&&row.kind==='review_queue'&&row.id.startsWith('self:uo:')&&liveReviewDates.has(row.due_at.slice(0,10)))).sort(compareObligations);
}
