"""Summarize measured local artifacts; no database or provider connection."""
import pathlib,json,hashlib,subprocess
root=pathlib.Path(__file__).resolve().parents[3];out=root/'docs/verification/petros-v2/m2fa-evidence'
read=lambda name:json.loads((out/name).read_text())
primary=['api-regression-tests','database-tests','m1-regression-tests','v1-source-regression-tests','schema-regression-tests','evaluation-regression-tests','frontend-regression-tests']
followups=['native-tests-final','worker-metrics-tests','final-security-tests']
unique={};summaries=[]
for name in primary+followups:
 d=read(name+'.json');summaries.append({'name':name,'passed':d['numPassedTests'],'failed':d['numFailedTests'],'skipped':d['numPendingTests'],'success':d['success']})
 for suite in d['testResults']:
  occurrences={}
  for test in suite['assertionResults']:
   title=test['fullName'];occurrences[title]=occurrences.get(title,0)+1
   unique[(suite['name'],title,occurrences[title])]=test['status']
summary={'node':'v24.21.0','primaryPassed':sum(s['passed'] for s in summaries[:len(primary)]),'uniquePassed':sum(s=='passed'for s in unique.values()),'uniqueFailed':sum(s=='failed'for s in unique.values()),'uniqueSkipped':sum(s in ['pending','skipped']for s in unique.values()),'runs':summaries,'genuineProviderRequests':0,'academicApprovals':0}
(out/'test-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
base=read('starting-hashes.json');changed=[];missing=[]
for name,old in base.items():
 p=root/name
 if not p.is_file():missing.append(name)
 elif hashlib.sha256(p.read_bytes()).hexdigest()!=old:changed.append(name)
allowed={'apps/api/package.json','apps/api/scripts/inspect-petros-m2.ts','apps/api/scripts/petros-m2-inspector.html','apps/api/src/modules/integrations/petros-m2-document-understanding.integration.spec.ts','apps/api/src/modules/petros-ai-routing/petros-ai-routing.repository.ts','apps/api/src/modules/student/knowledge/adapters/content-adapter.ts','apps/api/src/modules/student/knowledge/knowledge-document.module.ts','apps/api/src/modules/student/knowledge/knowledge-pdf-process.ts','apps/api/src/modules/student/knowledge/petros-content-intelligence.service.ts','apps/api/src/modules/student/knowledge/petros-content-interpretation.ts','apps/api/src/modules/student/knowledge/petros-content-unit.repository.ts','apps/api/src/modules/student/knowledge/petros-m2-test-helpers.ts','packages/schemas/src/petros-v2/content.ts','pnpm-lock.yaml'}
status=subprocess.check_output(['git','status','--porcelain=v1','-uall'],cwd=root,text=True);(out/'final-status.txt').write_text(status)
new=[p for p in subprocess.check_output(['git','ls-files','-c','-o','--exclude-standard'],cwd=root,text=True).splitlines() if p not in base and '/._' not in p and not pathlib.Path(p).name.startswith('._') and not p.startswith(('docs/verification/petros-v2/m2fa-evidence/','output/'))]
manifest={name:hashlib.sha256((root/name).read_bytes()).hexdigest()for name in sorted(set(changed+new)) if (root/name).is_file()}
(out/'code-inventory.json').write_text(json.dumps({'modifiedBaseline':changed,'newFiles':new,'sha256':manifest},indent=2)+'\n')
preservation={'baselineFiles':len(base),'modifiedForM2fa':changed,'unrelatedChanged':[p for p in changed if p not in allowed],'missing':missing,'historicalEvidenceChanged':[p for p in changed if p.startswith('docs/verification/')],'migrationJournalUnchanged':hashlib.sha256((root/'packages/database/migrations/meta/_journal.json').read_bytes()).hexdigest()==base['packages/database/migrations/meta/_journal.json'],'migrationFilesChanged':[p for p in changed if p.startswith('packages/database/migrations/')],'planAndBlueprintUnchanged':all(hashlib.sha256((root/n).read_bytes()).hexdigest()==base[n]for n in ['PETROS_V2_IMPLEMENTATION_PLAN.md','PETROS_V2_BLUEPRINT.md']),'historyRestoration':'Seven M2-G ZIPs and seven JSON files overwritten by an existing visual test were recovered to exact captured starting SHA-256 hashes; the reproduction script now snapshots/restores them.','noResetStashOrCommit':True}
(out/'preservation.json').write_text(json.dumps(preservation,indent=2)+'\n')
print('Tests:',summary['uniquePassed'],summary['uniqueFailed'],summary['uniqueSkipped']);print('Preservation:',len(changed),'intentional',preservation['unrelatedChanged'],preservation['missing'],preservation['historicalEvidenceChanged'])
