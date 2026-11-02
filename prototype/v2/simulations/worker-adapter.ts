import { execute, type Simulation, type SimTool } from './runtime';
export class SimulationWorker {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: ReturnType<typeof execute>) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url));
      this.worker.onmessage = (e) => {
        const p = this.pending.get(e.data.requestId);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(e.data.requestId);
        e.data.ok ? p.resolve(e.data.result) : p.reject(Error(e.data.error));
      };
      this.worker.onerror = () => {
        this.close();
      };
    } catch {
      this.worker = null;
    }
  }
  run(
    state: Simulation,
    tool: SimTool,
    args: Record<string, unknown> = {},
  ): Promise<ReturnType<typeof execute>> {
    if (!this.worker)
      return Promise.resolve().then(() => execute(state, tool, args));
    const requestId = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(Error('Simulation worker timed out.'));
      }, 8000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker!.postMessage({ requestId, state, tool, args });
    });
  }
  close() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(Error('Simulation worker closed.'));
    });
    this.pending.clear();
  }
}
