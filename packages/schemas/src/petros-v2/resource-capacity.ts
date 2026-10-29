import { z } from 'zod';

/** The registered memory-only kernel. Shared with the authoritative canvas reducer;
 * renderers consume its acknowledged quantities rather than another simulation. */
export const resourceCapacityInputSchema = z
  .object({
    kernel: z.literal('resource-capacity.v1'),
    totalGB: z.number().finite().min(0).max(1e6),
    reservedGB: z.number().finite().min(0).max(1e6),
    perVMGB: z.number().finite().positive().max(1e6),
  })
  .strict();
export type ResourceCapacityInput = z.infer<typeof resourceCapacityInputSchema>;
export function evaluateResourceCapacity(raw: unknown) {
  const input = resourceCapacityInputSchema.parse(raw);
  if (input.reservedGB > input.totalGB) throw new Error('M5_RESERVATION_EXCEEDS_TOTAL');
  const availableGB = input.totalGB - input.reservedGB;
  const ratio = availableGB / input.perVMGB;
  const nearest = Math.round(ratio);
  // Correct only floating-point noise at an integer boundary (e.g. 0.3 / 0.1).
  const capacity = Math.floor(
    Math.abs(ratio - nearest) <= 4 * Number.EPSILON * Math.max(1, Math.abs(ratio))
      ? nearest
      : ratio,
  );
  if (!Number.isSafeInteger(capacity) || capacity > 1e9) throw new Error('M5_KERNEL_OUTPUT_BOUNDS');
  return { availableGB, capacity };
}
export function observeResourceAllocation(
  raw: unknown,
  allocatedCount: number,
  requestedCount: number,
) {
  const input = resourceCapacityInputSchema.parse(raw);
  const { availableGB, capacity } = evaluateResourceCapacity(input);
  if (
    ![allocatedCount, requestedCount].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e9) ||
    allocatedCount > capacity
  )
    throw new Error('M5_INVALID_ALLOCATION');
  const admitted = requestedCount <= capacity;
  const count = admitted ? requestedCount : allocatedCount;
  const allocatedGB = count * input.perVMGB;
  return {
    availableGB,
    capacity,
    allocatedCount: count,
    allocatedGB,
    remainingGB: Math.max(0, availableGB - allocatedGB),
    utilizationPercent: availableGB === 0 ? 0 : (allocatedGB / availableGB) * 100,
    admitted,
  };
}
export const allocationPredictionSchema = z
  .object({
    requestedCount: z.number().int().min(0).max(1e9),
    expectation: z.enum(['fits', 'does_not_fit']),
  })
  .strict();
export const allocationObservationSchema = z
  .object({
    attemptId: z.string().min(1).max(160).optional(),
    observedAt: z.string().datetime().optional(),
    canvasRevision: z.number().int().nonnegative().optional(),
    beforeCount: z.number().int().min(0).max(1e9),
    requestedCount: z.number().int().min(0).max(1e9),
    prediction: allocationPredictionSchema.nullable(),
    availableGB: z.number().finite().nonnegative(),
    capacity: z.number().int().min(0).max(1e9),
    allocatedCount: z.number().int().min(0).max(1e9),
    allocatedGB: z.number().finite().nonnegative(),
    remainingGB: z.number().finite().nonnegative(),
    utilizationPercent: z.number().finite().min(0).max(100.0000001),
    admitted: z.boolean(),
  })
  .strict();
export const allocationAttemptSchema = z
  .object({
    id: z.string().min(1).max(160),
    sessionId: z.string().min(1).max(160),
    activityId: z.string().min(1).max(160),
    branchId: z.string().min(1).max(160),
    elementId: z.string().min(1).max(160),
    sourceId: z.string().min(1).max(160),
    sourceRevisionId: z.string().min(1).max(160),
    sourceHash: z.string().min(1).max(160),
    modelRevision: z.string().min(1).max(512),
    model: resourceCapacityInputSchema,
    kernel: z.literal('resource-capacity.v1'),
    initial: z
      .object({
        allocatedCount: z.number().int().min(0).max(1e9),
        availableGB: z.number().finite().nonnegative(),
        allocatedGB: z.number().finite().nonnegative(),
        remainingGB: z.number().finite().nonnegative(),
      })
      .strict(),
    operation: z.enum(['allocate', 'release', 'reset', 'demonstration', 'restore']),
    requestedCount: z.number().int().min(0).max(1e9),
    prediction: allocationPredictionSchema.nullable(),
    predictedAt: z.string().datetime().nullable(),
    startedAt: z.string().datetime(),
    observedAt: z.string().datetime().nullable(),
    executedCount: z.number().int().min(0).max(1e9).nullable(),
    initialCanvasRevision: z.number().int().nonnegative(),
    canvasRevision: z.number().int().nonnegative(),
    status: z.enum(['predicted', 'observed', 'explained', 'completed', 'cancelled', 'superseded']),
    explanation: z
      .object({
        text: z.string().min(1).max(500),
        at: z.string().datetime(),
        canvasRevision: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AllocationAttempt = z.infer<typeof allocationAttemptSchema>;
export const resourceAllocationSchema = z
  .object({
    model: resourceCapacityInputSchema,
    allocatedCount: z.number().int().min(0).max(1e9),
    prediction: allocationPredictionSchema.nullable(),
    observations: z.array(allocationObservationSchema).max(32),
    // Additive compatibility: historical M5 canvases remain readable. New operations
    // receive exact server provenance and never activate an unlinked old observation.
    attempts: z.array(allocationAttemptSchema).max(32).optional(),
    activeAttemptId: z.string().min(1).max(160).nullable().optional(),
  })
  .strict();
export type ResourceAllocation = z.infer<typeof resourceAllocationSchema>;
