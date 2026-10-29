import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { defer, lastValueFrom } from 'rxjs';

type Stage =
  | 'guards'
  | 'transaction'
  | 'transaction_setup'
  | 'publication_lookup'
  | 'session_lock'
  | 'session_read'
  | 'owner_authorization'
  | 'source_authority'
  | 'public_projection'
  | 'queue_dispatch'
  | 'worker_claim'
  | 'kernel_evaluation'
  | 'evaluation_publish';
type Trace = { start: number; stages: Partial<Record<Stage, number>> };
const active = new AsyncLocalStorage<Trace>();
const requests = new WeakMap<object, number>();
const enabled = () => process.env.PETROS_M6_TIMING === '1';
export function startPetrosRequest(request: object) {
  if (enabled()) requests.set(request, performance.now());
}
/** Timings contain fixed stage names and durations only: no student work,
 * identifiers, source text, provider context, private criteria or credentials. */
export async function timePetrosStage<T>(name: Stage, work: () => Promise<T>): Promise<T> {
  const trace = active.getStore();
  if (!trace) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    trace.stages[name] = (trace.stages[name] ?? 0) + performance.now() - start;
  }
}
const durations = (trace: Trace) => ({ ...trace.stages, total: performance.now() - trace.start });
export function tracePetrosWorker<T>(
  work: () => Promise<T>,
  kind: 'worker' | 'queue' = 'worker',
): Promise<T> {
  if (!enabled()) return work();
  const trace: Trace = { start: performance.now(), stages: {} };
  return active.run(trace, async () => {
    try {
      return await work();
    } finally {
      process.stdout.write(
        JSON.stringify({ kind: `petros-${kind}-timing`, durationsMs: durations(trace) }) + '\n',
      );
    }
  });
}
export class PetrosTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (!enabled()) return next.handle();
    const request = context.switchToHttp().getRequest<object>();
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void; headersSent: boolean }>();
    const start = requests.get(request) ?? performance.now();
    const trace: Trace = { start, stages: { guards: performance.now() - start } };
    return defer(() =>
      active.run(trace, async () => {
        try {
          return await lastValueFrom(next.handle());
        } finally {
          const values = durations(trace);
          if (!response.headersSent)
            response.setHeader(
              'Server-Timing',
              Object.entries(values)
                .map(([name, value]) => `${name};dur=${value.toFixed(2)}`)
                .join(', '),
            );
        }
      }),
    );
  }
}
