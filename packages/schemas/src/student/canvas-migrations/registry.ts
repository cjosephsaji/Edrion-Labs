import { GRAPH_SCHEMA_VERSION } from '../visuals';
import type { CanvasMigrationStep } from './types';
import { CanvasMigrationError } from './types';

/** Production registry: empty while the deployed contract remains v1. */
export const CANVAS_GRAPH_MIGRATION_STEPS: readonly CanvasMigrationStep[] = [];

export const CURRENT_CANVAS_GRAPH_VERSION = GRAPH_SCHEMA_VERSION;

export function validateCanvasMigrationRegistry(
  steps: readonly CanvasMigrationStep[],
  currentVersion: number,
): void {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new CanvasMigrationError(
      'GRAPH_MIGRATION_CHAIN_GAP',
      `Current canvas graph version must be a positive integer`,
    );
  }

  if (steps.length === 0) {
    return;
  }

  const sorted = [...steps].sort((a, b) => a.from - b.from);
  const seenFrom = new Set<number>();

  for (const [index, step] of sorted.entries()) {
    if (step.from >= step.to) {
      throw new CanvasMigrationError(
        'GRAPH_MIGRATION_CHAIN_GAP',
        `Migration step ${step.from}->${step.to} must move forward`,
      );
    }
    if (seenFrom.has(step.from)) {
      throw new CanvasMigrationError(
        'GRAPH_MIGRATION_CHAIN_GAP',
        `Duplicate migration step for version ${step.from}`,
      );
    }
    seenFrom.add(step.from);

    if (index === 0) {
      if (step.from !== 1) {
        throw new CanvasMigrationError(
          'GRAPH_MIGRATION_CHAIN_GAP',
          `Migration chain must start at version 1 (missing step ending at ${step.from})`,
        );
      }
    } else if (sorted[index - 1]!.to !== step.from) {
      throw new CanvasMigrationError(
        'GRAPH_MIGRATION_CHAIN_GAP',
        `Migration chain gap between v${sorted[index - 1]!.to} and v${step.from}`,
      );
    }
  }

  if (sorted[sorted.length - 1]!.to !== currentVersion) {
    throw new CanvasMigrationError(
      'GRAPH_MIGRATION_CHAIN_GAP',
      `Migration chain ends at v${sorted[sorted.length - 1]!.to}, expected v${currentVersion}`,
    );
  }
}
