import { canvasGraphSchema, type CanvasGraph } from '../visuals';
import {
  CANVAS_GRAPH_MIGRATION_STEPS,
  CURRENT_CANVAS_GRAPH_VERSION,
  validateCanvasMigrationRegistry,
} from './registry';
import type { CanvasMigrationStep, MigrateCanvasGraphResult } from './types';
import { CanvasMigrationError } from './types';

export const CANVAS_MIGRATION_BUDGET_MS = 50;

function readGraphSchemaVersion(graph: unknown): number | null {
  if (!graph || typeof graph !== 'object') return null;
  const version = (graph as { graph_schema_version?: unknown }).graph_schema_version;
  return typeof version === 'number' && Number.isInteger(version) ? version : null;
}

function applyMigrationChain(
  graph: unknown,
  sourceVersion: number,
  steps: readonly CanvasMigrationStep[],
  currentVersion: number,
): { graph: unknown; appliedSteps: string[] } {
  let current = graph;
  const appliedSteps: string[] = [];
  let version = sourceVersion;

  while (version < currentVersion) {
    const step = steps.find((entry) => entry.from === version);
    if (!step) {
      throw new CanvasMigrationError(
        'UNSUPPORTED_GRAPH_VERSION',
        `No migration step registered for canvas graph version ${version}`,
      );
    }
    current = step.migrate(current);
    appliedSteps.push(step.description);
    version = step.to;
  }

  return { graph: current, appliedSteps };
}

export type MigrateCanvasGraphOptions = {
  steps?: readonly CanvasMigrationStep[];
  currentVersion?: number;
  parse?: (graph: unknown) => CanvasGraph;
};

export function migrateCanvasGraphToCurrent(
  graph: unknown,
  options: MigrateCanvasGraphOptions = {},
): MigrateCanvasGraphResult {
  const steps = options.steps ?? CANVAS_GRAPH_MIGRATION_STEPS;
  const currentVersion = options.currentVersion ?? CURRENT_CANVAS_GRAPH_VERSION;
  const parse = options.parse ?? ((value: unknown) => canvasGraphSchema.parse(value));

  validateCanvasMigrationRegistry(steps, currentVersion);

  const sourceSchemaVersion = readGraphSchemaVersion(graph);
  if (sourceSchemaVersion === null) {
    throw new CanvasMigrationError(
      'GRAPH_MIGRATION_INVALID',
      'Canvas graph is missing a valid graph_schema_version',
    );
  }

  if (sourceSchemaVersion > currentVersion) {
    throw new CanvasMigrationError(
      'UNSUPPORTED_GRAPH_VERSION',
      `Canvas graph version ${sourceSchemaVersion} is newer than supported version ${currentVersion}`,
    );
  }

  if (sourceSchemaVersion < 1) {
    throw new CanvasMigrationError(
      'UNSUPPORTED_GRAPH_VERSION',
      `Canvas graph version ${sourceSchemaVersion} is not supported`,
    );
  }

  const { graph: migrated, appliedSteps } =
    sourceSchemaVersion === currentVersion
      ? { graph, appliedSteps: [] as string[] }
      : applyMigrationChain(graph, sourceSchemaVersion, steps, currentVersion);

  let parsed: CanvasGraph;
  try {
    parsed = parse(migrated);
  } catch (error) {
    throw new CanvasMigrationError(
      'GRAPH_MIGRATION_INVALID',
      error instanceof Error ? error.message : 'Migrated graph failed validation',
    );
  }

  return {
    graph: parsed,
    sourceSchemaVersion,
    targetSchemaVersion: currentVersion,
    migrated: appliedSteps.length > 0,
    appliedSteps,
  };
}

export function assertCanvasMigrationRegistryAtStartup(): void {
  validateCanvasMigrationRegistry(CANVAS_GRAPH_MIGRATION_STEPS, CURRENT_CANVAS_GRAPH_VERSION);
}
