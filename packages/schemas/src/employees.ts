import { z } from 'zod';
import { AccountStatus } from '@edrion/shared-types';
import { emailSchema, paginationQuerySchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';

/** Edrion staff accounts — a separate principal domain, never trusted implicitly. */
export const employeeStatusSchema = zEnumFromConst(AccountStatus);

export const listEmployeesQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(120).optional(),
  status: employeeStatusSchema.optional(),
  roleId: z.string().uuid().optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const createEmployeeSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(160),
  title: z.string().trim().max(120).optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** Disable / restore an employee. Disable is sensitive (recent auth required). */
export const employeeStatusActionSchema = z.object({
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type EmployeeStatusActionInput = z.infer<typeof employeeStatusActionSchema>;

/** Replace an employee's role assignments wholesale. Sensitive. */
export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).max(50),
  reason: reasonSchema,
});
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
