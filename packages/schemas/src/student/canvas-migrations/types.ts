import type { CanvasGraph } from '../visuals';

export type CanvasMigrationStep = {
  from: number;
  to: number;
  description: string;
  migrate: (graph: unknown) => unknown;
};

export type CanvasMigrationErrorCode =
  | 'UNSUPPORTED_GRAPH_VERSION'
  | 'GRAPH_MIGRATION_INVALID'
  | 'GRAPH_MIGRATION_CHAIN_GAP';

export class CanvasMigrationError extends Error {
  constructor(
    readonly code: CanvasMigrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CanvasMigrationError';
  }
}

export type MigrateCanvasGraphResult = {
  graph: CanvasGraph;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  migrated: boolean;
  appliedSteps: readonly string[];
};

export const MIGRATED_FORMAT_LABEL = 'Updated format.' as const;
