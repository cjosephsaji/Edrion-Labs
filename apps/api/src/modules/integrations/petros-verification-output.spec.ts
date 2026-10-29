import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { petrosVerificationOutput } from './petros-verification-output';
const directory = mkdtempSync(join(tmpdir(), 'studio-evidence-guard-'));
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe('timestamped M4 evidence also protects legacy writers', () => {
  it('uses the M4 directory when the general override was omitted', () => {
    vi.stubEnv('PETROS_VERIFICATION_EVIDENCE_DIR', undefined);
    vi.stubEnv('PETROS_M4_EVIDENCE_DIR', directory);
    expect(petrosVerificationOutput('docs/verification/petros-v2/m3-evidence/receipt.json')).toBe(
      join(directory, 'docs/verification/petros-v2/m3-evidence/receipt.json'),
    );
  });
  it('preserves an explicit general evidence directory', () => {
    vi.stubEnv('PETROS_VERIFICATION_EVIDENCE_DIR', join(directory, 'explicit'));
    vi.stubEnv('PETROS_M4_EVIDENCE_DIR', directory);
    expect(petrosVerificationOutput('receipt.json')).toBe(join(directory, 'explicit/receipt.json'));
  });
});
