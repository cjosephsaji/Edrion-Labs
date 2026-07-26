import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CURRENT_CANVAS_GRAPH_VERSION,
  MIGRATED_FORMAT_LABEL,
  assertCanvasMigrationRegistryAtStartup,
  migrateCanvasGraphToCurrent,
  type CanvasGraph,
  type MigrateCanvasGraphResult,
} from '@edrion/schemas';

export type MigratedCanvasGraphView = MigrateCanvasGraphResult & {
  formatLabel: typeof MIGRATED_FORMAT_LABEL | null;
};

@Injectable()
export class VisualSchemaMigrationService implements OnModuleInit {
  private readonly logger = new Logger(VisualSchemaMigrationService.name);

  onModuleInit(): void {
    assertCanvasMigrationRegistryAtStartup();
    this.logger.log(`Canvas graph migration registry ready at v${CURRENT_CANVAS_GRAPH_VERSION}`);
  }

  migrateGraphForRead(graph: unknown): MigratedCanvasGraphView {
    const result = migrateCanvasGraphToCurrent(graph);
    return {
      ...result,
      formatLabel: result.migrated ? MIGRATED_FORMAT_LABEL : null,
    };
  }

  needsPersistedMigration(schemaVersion: number): boolean {
    return schemaVersion < CURRENT_CANVAS_GRAPH_VERSION;
  }

  migratedGraphLabel(schemaVersion: number): typeof MIGRATED_FORMAT_LABEL | null {
    return schemaVersion < CURRENT_CANVAS_GRAPH_VERSION ? MIGRATED_FORMAT_LABEL : null;
  }

  toCanvasGraph(graph: unknown): CanvasGraph {
    return this.migrateGraphForRead(graph).graph;
  }
}
