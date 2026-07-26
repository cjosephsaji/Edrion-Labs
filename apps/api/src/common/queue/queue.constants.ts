/**
 * Durable background queues (BullMQ over Redis). Long-running or retryable work runs off the
 * request path: imports, exports, report generation, notifications, billing reconciliation, and
 * deferred AI work. Phase 10e wires per-job tracking (background_jobs) + System Health on top of
 * this framework; the sweeps it converts reuse these same queues.
 */
export const QUEUE_NAMES = [
  'imports',
  'exports',
  'reports',
  'notifications',
  'billing-sync',
  'ai',
  'maintenance',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** A health/round-trip job every queue understands — used by the 10b live proof. */
export const PING_JOB = 'system.ping';

export interface PingJobData {
  /** Redis marker key the worker sets on completion so a smoke can observe the round-trip. */
  marker: string;
}
