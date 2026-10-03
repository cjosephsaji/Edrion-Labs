import { z } from 'zod';
import { petrosProjectileBindingSchema, petrosProjectileParameterChangeSchema } from './petros-projectile-binding';
import { petrosProjectileInputSchema, petrosProjectileStateSchema } from './petros-projectile-model';
import { petrosKnowledgePolicySchema } from './petros-knowledge-policy';

export const PETROS_PROJECTILE_COMMAND_VERSION = 'petros.projectile-command.v1' as const;
const revision = z.number().int().nonnegative().max(100_000);
export const petrosProjectileCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_PROJECTILE_COMMAND_VERSION),
  operationId: z.string().uuid(),
  expectedVersion: revision,
  binding: petrosProjectileBindingSchema,
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('initialise'), input: petrosProjectileInputSchema }).strict(),
    z.object({ kind: z.literal('parameter'), change: petrosProjectileParameterChangeSchema }).strict(),
  ]),
}).strict();
export type PetrosProjectileCommand = z.infer<typeof petrosProjectileCommandSchema>;

export const petrosProjectileSnapshotSchema = z.object({
  schemaVersion: z.literal('petros.projectile-snapshot.v1'),
  version: revision,
  binding: petrosProjectileBindingSchema,
  state: petrosProjectileStateSchema,
  policy: petrosKnowledgePolicySchema,
  operationId: z.string().uuid(),
  commandHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PetrosProjectileSnapshot = z.infer<typeof petrosProjectileSnapshotSchema>;

// Cancellation names the exact command. It cannot cancel an unrelated changed payload.
export const petrosProjectileCancelSchema = z.object({ command: petrosProjectileCommandSchema }).strict();
export const petrosProjectileResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), binding: petrosProjectileBindingSchema, defaultInput: petrosProjectileInputSchema }).strict(),
  z.object({ status: z.literal('available'), snapshot: petrosProjectileSnapshotSchema, replayed: z.boolean() }).strict(),
  z.object({ status: z.literal('cancelled'), operationId: z.string().uuid() }).strict(),
  z.object({ status: z.literal('disabled') }).strict(),
  z.object({ status: z.literal('unavailable'), recovery: z.literal('original_source'), reason: z.string().max(240) }).strict(),
]);
