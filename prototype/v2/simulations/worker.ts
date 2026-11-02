/// <reference lib="webworker" />
import { execute, type Simulation, type SimTool } from './runtime';
self.onmessage = (
  e: MessageEvent<{
    requestId: number;
    state: Simulation;
    tool: SimTool;
    args: Record<string, unknown>;
  }>,
) => {
  const { requestId, state, tool, args } = e.data;
  try {
    self.postMessage({
      requestId,
      ok: true,
      result: execute(state, tool, args),
    });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Simulation failed',
    });
  }
};
