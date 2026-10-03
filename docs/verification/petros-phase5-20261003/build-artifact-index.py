import datetime,hashlib,json,pathlib
root=pathlib.Path('/Volumes/Chris/Edrion Labs');base=root/'docs/verification/petros-phase5-20261003'
rows=[]
for p in sorted(base.rglob('*')):
 if p.is_file() and p.name!='artifact-index.json' and not p.name.startswith('._'):
  rows.append({'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
external=['docs/PETROS-PHASE-5-VERIFICATION-RESULTS.md','docs/PETROS-LEARNING-HARNESS-PLAN.md']
for name in external:
 p=root/name;rows.append({'path':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceManifestExcluded':True})
index={'schemaVersion':'petros.phase5.artifact-index.v1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':len(rows),'artifacts':rows,'identity':'frozen-final-r5; reconfirmed verified/closing-final-r5','note':'Candidate failures and earlier identities are retained as historical attempts, not final gate passes. R1 Firefox launch is unavailable and does not count as a passed journey.'}
(base/'artifact-index.json').write_text(json.dumps(index,indent=2)+'\n')
print(json.dumps({'path':str(base/'artifact-index.json'),'sha256':hashlib.sha256((base/'artifact-index.json').read_bytes()).hexdigest(),'files':len(rows)}))
