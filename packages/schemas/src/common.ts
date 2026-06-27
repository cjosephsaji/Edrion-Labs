import { z } from 'zod';

/** Build a Zod enum from a `const` record (our enum style in @edrion/shared-types). */
export function zEnumFromConst<T extends Record<string, string>>(obj: T) {
  const values = Object.values(obj) as [string, ...string[]];
  return z.enum(values);
}

export const uuidSchema = z.string().uuid();

/** Money — integer minor units. Rejects floats; the wire format is always integer. */
export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.enum(['USD', 'INR', 'EUR', 'GBP', 'AED']),
});
export type MoneyInput = z.infer<typeof moneySchema>;

/** Offset pagination query (directories). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Cursor pagination query (audit/activity streams). */
export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export const sortQuerySchema = z.object({
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type SortQuery = z.infer<typeof sortQuerySchema>;

/** A required, human-meaningful reason — used to gate sensitive/audited actions. */
export const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Provide a reason (min 5 characters)')
  .max(500);

/** Optimistic-concurrency token sent back on sensitive updates. */
export const versionSchema = z.number().int().nonnegative();

export const emailSchema = z.string().trim().toLowerCase().email();
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, 'Invalid phone number')
  .optional();
