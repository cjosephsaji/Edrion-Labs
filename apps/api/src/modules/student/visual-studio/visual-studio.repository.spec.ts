import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VisualStudioRepository } from './visual-studio.repository';

describe('VisualStudioRepository', () => {
  let db: {
    execute: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let repo: VisualStudioRepository;

  beforeEach(() => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteChain = { where: deleteWhere };
    db = {
      execute: vi.fn(),
      delete: vi.fn().mockReturnValue(deleteChain),
      select: vi.fn(),
    };
    repo = new VisualStudioRepository(db as never);
  });

  it('pruneStaleRevisions deletes overflow and orphaned revision rows', async () => {
    db.execute.mockResolvedValue([{ id: 'rev-1' }, { id: 'rev-2' }]);

    const leftJoin = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: 'rev-orphan' }]),
    });
    const from = vi.fn().mockReturnValue({ leftJoin });
    db.select.mockReturnValue({ from });

    const count = await repo.pruneStaleRevisions();

    expect(count).toBe(3);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(2);
  });

  it('pruneStaleRevisions returns zero when nothing is stale', async () => {
    db.execute.mockResolvedValue([]);

    const leftJoin = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    const from = vi.fn().mockReturnValue({ leftJoin });
    db.select.mockReturnValue({ from });

    await expect(repo.pruneStaleRevisions()).resolves.toBe(0);
    expect(db.delete).not.toHaveBeenCalled();
  });
});
