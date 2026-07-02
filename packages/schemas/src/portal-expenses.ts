import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal SCHOOL EXPENSES (money out; owned by the Finance Manager) request contracts.
 * `amount` is integer MINOR units (the web enters major units and multiplies ×100 before sending),
 * matching the fees/payroll money convention. Tenancy + campus scope are never taken from the body.
 */
const optionalText = (max = 200) => z.string().trim().max(max).nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();

export const EXPENSE_CATEGORIES = [
  'salaries',
  'utilities',
  'supplies',
  'maintenance',
  'rent',
  'transport',
  'events',
  'misc',
] as const;
export const EXPENSE_METHODS = ['cash', 'card', 'bank_transfer', 'cheque', 'online', 'other'] as const;
export const EXPENSE_STATUSES = ['pending', 'paid', 'cancelled'] as const;

export const expensesListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});
export type ExpensesListQuery = z.infer<typeof expensesListQuerySchema>;

export const createExpenseSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  category: z.enum(EXPENSE_CATEGORIES).default('misc'),
  vendor: optionalText(160),
  /** Integer minor units (paise/cents). */
  amount: z.number().int('Whole minor units only').min(0, 'Must be 0 or more'),
  method: z.enum(EXPENSE_METHODS).default('bank_transfer'),
  reference: optionalText(120),
  expenseDate: isoDate,
  status: z.enum(EXPENSE_STATUSES).default('pending'),
  notes: optionalText(2000),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial().extend({ version: versionSchema });
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
