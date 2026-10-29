import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const m2faSourceRoot = resolve(__dirname, '../../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources/m2fa');
export const readM2fa = (name: string) => readFileSync(resolve(m2faSourceRoot, name));
export const freshSignal = (): AbortSignal => new AbortController().signal;
