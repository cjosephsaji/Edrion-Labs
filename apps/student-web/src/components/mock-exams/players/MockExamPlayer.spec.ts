import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRenderSkin } from '@edrion/schemas';

/**
 * Guards D-T2-017: nta resolves to standard and no bespoke NTA player module is wired.
 */
describe('MockExamPlayer NTA deferral', () => {
  it('resolver maps nta → standard', () => {
    expect(resolveRenderSkin('nta')).toBe('standard');
  });

  it('does not ship a players/nta component directory', () => {
    const ntaDir = join(__dirname, 'nta');
    expect(existsSync(ntaDir)).toBe(false);
  });

  it('MockExamPlayer source does not import an nta player module', () => {
    const src = readFileSync(join(__dirname, 'MockExamPlayer.tsx'), 'utf8');
    expect(src).not.toMatch(/players\/nta|from ['\"].*nta\//);
    expect(src).toMatch(/resolveRenderSkin/);
    expect(src).toMatch(/StandardPlayer/);
    expect(src).toMatch(/PaperPlayer/);
  });
});
