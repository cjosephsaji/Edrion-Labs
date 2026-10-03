import datetime, hashlib, json, pathlib, re

root = pathlib.Path('/Volumes/Chris/Edrion Labs')
base = root/'docs/verification/petros-phase5-20261003'
identities = {name:json.loads((base/name/'identity.json').read_text())
              for name in ['frozen-final-r5','verified-final-r5','closing-final-r5']}
keys = ['head','branch','sourceManifestSha256','sourceManifestFileCount','relevantUntrackedSha256','protectedHashes']
frozen = identities['frozen-final-r5']
assert all(all(v[k] == frozen[k] for k in keys) for v in identities.values())
bundle = json.loads((base/'engineering-release-bundle.json').read_text())
assert bundle['applicationSource']['sha256'] == frozen['sourceManifestSha256']
assert all(c['exitCode'] == 0 for c in bundle['commands'])
assert bundle['engineeringGates']['P5-E9'].startswith('blocked_firefox_runtime')
assert json.loads((base/'final-r5-closing-diff-check.json').read_text())['exitCode'] == 0
assert json.loads((base/'final-r5-browser-firefox.json').read_text())['exitCode'] == 1
cleanup = json.loads((base/'cleanup-record.json').read_text())
assert not cleanup['taskServicesRemaining']
links = []
for p in [root/'docs/PETROS-PHASE-5-VERIFICATION-RESULTS.md']:
    for label, target in re.findall(r'\[([^\]]+)\]\(([^)]+)\)',p.read_text()):
        if target.startswith(('http','/')):continue
        link = (p.parent/target).resolve()
        # The artifact index is generated as the next, final sealing operation.
        assert link.exists() or link == base/'artifact-index.json', (label,target)
        links.append({'label':label,'target':target})
record = {'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'matchingKeys':keys,'identities':{n:{'timestamp':v['timestamp'],**{k:v[k] for k in keys}} for n,v in identities.items()},
    'finalCommandRecords':len(bundle['commands']),'finalBrowserCheckpoints':{e:v['checkpoints'] for e,v in bundle['browsers'].items()},
    'browserPageErrors':{e:v['pageErrors'] for e,v in bundle['browsers'].items()},
    'engineeringExit':'blocked_R1_Firefox_runtime','externalAcceptance':'pending','admissions':'disabled',
    'resultLinksChecked':links, 'cleanupCompletedAt':cleanup['completedAt'],
    'resultsSha256':hashlib.sha256((root/'docs/PETROS-PHASE-5-VERIFICATION-RESULTS.md').read_bytes()).hexdigest(),
    'ledgerSha256':hashlib.sha256((root/'docs/PETROS-LEARNING-HARNESS-PLAN.md').read_bytes()).hexdigest()}
(base/'closing-verification.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:v for k,v in record.items() if k not in ['identities','resultLinksChecked']},indent=2))
