/** Bounded, local User Timing entries. No payloads, answer text or identifiers. */
export function beginPetrosTiming(stage: string) {
  const started = performance.now();
  return () => {
    const name = `petros:${stage}`;
    // Per-stage retention is bounded even during long sessions.
    try {
      if (performance.getEntriesByName(name).length >= 128) performance.clearMeasures(name);
      performance.measure?.(name, { start: started, end: performance.now() });
    } catch {
      // Optional instrumentation cannot interrupt saving on older User Timing implementations.
    }
  };
}
