import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

export const createPortalCalendarEventSchema = z.object({
  kind: z.enum(['exam', 'holiday', 'event']),
  title: z.string().trim().min(1).max(200),
  detail: z.string().max(2000).nullish(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  timeLabel: z.string().max(120).nullish(),
  audience: z.record(z.unknown()).default({}),
  status: z.enum(['draft', 'published']).default('draft'),
});

export const updatePortalCalendarEventSchema = createPortalCalendarEventSchema.partial().extend({
  version: versionSchema,
});

export const portalCalendarListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  kind: z.enum(['exam', 'holiday', 'event']).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export type CreatePortalCalendarEventInput = z.infer<typeof createPortalCalendarEventSchema>;
