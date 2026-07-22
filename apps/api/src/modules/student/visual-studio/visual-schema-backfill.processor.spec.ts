import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VisualSchemaBackfillProcessor } from './visual-schema-backfill.processor';

describe('VisualSchemaBackfillProcessor', () => {
  let repo: {
    claimCanvasesForSchemaMigration: ReturnType<typeof vi.fn>;
  };
  let revisions: {
    commitMigration: ReturnType<typeof vi.fn>;
  };
  let processor: VisualSchemaBackfillProcessor;

  beforeEach(() => {
    repo = {
      claimCanvasesForSchemaMigration: vi.fn(),
    };
    revisions = {
      commitMigration: vi.fn(),
    };
    processor = new VisualSchemaBackfillProcessor(
      { select: vi.fn() } as never,
      { enqueue: vi.fn() } as never,
      { register: vi.fn() } as never,
      { run: vi.fn() } as never,
      repo as never,
      revisions as never,
    );
  });

  it('does not duplicate migration revisions when backfill retries the same canvas', async () => {
    repo.claimCanvasesForSchemaMigration.mockResolvedValue(['canvas-1']);
    revisions.commitMigration.mockResolvedValueOnce('migrated');
    revisions.commitMigration.mockResolvedValueOnce('skipped');

    const first = await processor.runBatch(null);
    const second = await processor.runBatch('canvas-1');

    expect(first).toEqual({ migrated: 1, cursor: null });
    expect(second).toEqual({ migrated: 0, cursor: null });
    expect(revisions.commitMigration).toHaveBeenCalledTimes(2);
  });
});
