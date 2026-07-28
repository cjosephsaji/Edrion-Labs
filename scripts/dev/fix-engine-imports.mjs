import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'apps/api/src/modules/student/learn/engine');

const replacements = [
  ["from '../student.types'", "from '../../student.types'"],
  ["from '../learn-ai/", "from '../../learn-ai/"],
  ["from '../ledger/", "from '../../ledger/"],
  ["from '../library/", "from '../../library/"],
  ["from '../visual-studio/", "from '../../visual-studio/"],
  ["from '../../feature-controls/", "from '../../../feature-controls/"],
  ["from '../../../common/", "from '../../../../common/"],
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.ts')) {
      let s = readFileSync(p, 'utf8');
      let changed = false;
      for (const [a, b] of replacements) {
        if (s.includes(a)) {
          s = s.split(a).join(b);
          changed = true;
        }
      }
      if (changed) writeFileSync(p, s);
    }
  }
}

walk(root);
