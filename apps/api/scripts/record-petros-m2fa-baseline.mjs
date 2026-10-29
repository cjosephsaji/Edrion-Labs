import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { realpathSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'../../..'),req=createRequire(resolve(root,'apps/api/package.json'));
function metadata(name,entry=req.resolve(name)) {
 let directory=dirname(realpathSync(entry));while(!existsSync(join(directory,'package.json')))directory=dirname(directory);
 const p=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));return {name:p.name,version:p.version,license:p.license};
}
const packages=['jszip','mammoth','@napi-rs/canvas','pdfjs-dist','mdast-util-from-markdown','mdast-util-gfm','micromark-extension-gfm'].map(n=>metadata(n));
packages.push(metadata('sax',createRequire(req.resolve('mammoth')).resolve('sax')));
const hashes=JSON.parse(readFileSync(resolve(root,'docs/verification/petros-v2/m2fa-evidence/starting-hashes.json'),'utf8'));
const status=readFileSync(resolve(root,'docs/verification/petros-v2/m2fa-evidence/starting-status.txt'),'utf8');
const originalJournal=JSON.parse(readFileSync(resolve(root,'docs/verification/petros-v2/m2fa-evidence/migration-journal-before.json'),'utf8'));
const data={branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),startingStatusEntries:status.trim().split('\n').length,baselineFiles:Object.keys(hashes).length,
 preservedBaselineReports:Object.fromEntries(Object.entries(hashes).filter(([p])=>/PETROS_V2|docs\/verification\/petros-v2\/(?:m1-foundations|m2-document-understanding|m2-quality-and-semantics|readiness)/.test(p))),
 originalMigrationJournal:{sha256:createHash('sha256').update(readFileSync(resolve(root,'docs/verification/petros-v2/m2fa-evidence/migration-journal-before.json'))).digest('hex'),entries:originalJournal.entries.length,tail:originalJournal.entries.slice(-4)},
 flags:{PETROS_M2_ISOLATED_ENABLED:'unchanged; test mode and explicit true required',studentV2Routes:'not enabled',providerSpending:'not authorized'},dependencies:packages,
 dependencyAdditions:[{name:'mdast-util-from-markdown',version:'2.0.3',reason:'CommonMark syntax tree with positions; existing frontend transitive parser pinned directly for isolated API extraction'},{name:'mdast-util-gfm',version:'3.1.0',reason:'Existing GFM AST extension, preserves table syntax and cells'},{name:'micromark-extension-gfm',version:'3.0.0',reason:'Existing GFM tokenizer extension; no HTML compilation or execution'}]};
writeFileSync(resolve(root,'docs/verification/petros-v2/m2fa-evidence/baseline.json'),JSON.stringify(data,null,2));
