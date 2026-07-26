import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = __dirname;
const FORBIDDEN = [
  'repo.patchCanvas(',
  'repo.createGeneratedCanvas(',
  'repo.deleteCanvas(',
  'repo.commitSchemaMigrationRevision(',
  'repo.createMemoryCanvas(',
  'repo.restoreRevision(',
];
const FACADE_FILES = new Set(['visual-studio.service.ts', 'canvas.controller.ts']);

describe('visual revision gateway architecture', () => {
  it('repository does not expose direct graph mutation methods', () => {
    const source = readFileSync(join(ROOT, 'visual-studio.repository.ts'), 'utf8');
    for (const token of FORBIDDEN) {
      expect(source.includes(`async ${token}`)).toBe(false);
    }
  });

  it('production services route commits through VisualRevisionService', () => {
    const files = readdirSync(ROOT).filter(
      (name) => name.endsWith('.service.ts') || name.endsWith('.processor.ts'),
    );
    for (const file of files) {
      if (file === 'visual-revision.service.ts' || FACADE_FILES.has(file)) continue;
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const token of FORBIDDEN) {
        expect(source.includes(token), `${file} must not call ${token}`).toBe(false);
      }
    }
  });
});
