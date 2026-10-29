import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/** New runs may redirect historical writers without touching their original evidence. */
export function petrosVerificationOutput(relative: string) {
  const root = resolve(__dirname, '../../../../..');
  // M4 already requires a new evidence directory. Carry that boundary through
  // legacy M3 writers even when the older, general override was omitted.
  const evidenceRoot =
    process.env.PETROS_VERIFICATION_EVIDENCE_DIR ?? process.env.PETROS_M4_EVIDENCE_DIR;
  const target = evidenceRoot ? resolve(evidenceRoot, relative) : resolve(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  return target;
}
