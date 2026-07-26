import type { CanvasMigrationStep } from '../types';

/** Test-only step proving the migration chain without shipping schema v2. */
export const syntheticV1ToV2Step: CanvasMigrationStep = {
  from: 1,
  to: 2,
  description: 'Synthetic test migration: stamp v2 and normalize groups',
  migrate(graph) {
    const value = graph as Record<string, unknown>;
    return {
      ...value,
      graph_schema_version: 2,
      groups: Array.isArray(value.groups) ? value.groups : [],
    };
  },
};

export const syntheticV2ToV1Step: CanvasMigrationStep = {
  from: 2,
  to: 1,
  description: 'Synthetic test migration: fold v2 preview back to deployed v1',
  migrate(graph) {
    const value = graph as Record<string, unknown>;
    const { graph_schema_version: _version, ...rest } = value;
    return {
      ...rest,
      graph_schema_version: 1,
    };
  },
};
