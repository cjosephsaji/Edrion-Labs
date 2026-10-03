import datetime, hashlib, json, pathlib, shutil, subprocess

root = pathlib.Path('/Volumes/Chris/Edrion Labs')
out = root / 'docs/verification/petros-phase4-20261002'
stamp = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
frozen = json.loads((out / 'frozen-final-r2/identity.json').read_text())
for name in ['verified-final-r2', 'closing-final-r2']:
    other = json.loads((out / name / 'identity.json').read_text())
    for key in ['head', 'branch', 'sourceManifestSha256', 'sourceManifestFileCount', 'relevantUntrackedSha256', 'protectedHashes']:
        assert other[key] == frozen[key], (name, key)

index = json.loads((out / 'command-index.json').read_text())
record = json.loads((out / 'closing-r2-diff-check.json').read_text())
assert record['exitCode'] == 0
record.update(name='closing-r2-diff-check', log='closing-r2-diff-check.log', logSha256=hashlib.sha256((out / 'closing-r2-diff-check.log').read_bytes()).hexdigest())
index['commands'].append(record)
(out / 'command-index.json').write_text(json.dumps(index, indent=2) + '\n')
shutil.copyfile('/tmp/petros-phase4-institution-web.log', out / 'frozen-r2-institution-browser.log')

owned_pids = [41609, 41610, 41616, 70812, 70875, 70896]
for pid in owned_pids:
    assert subprocess.run(['ps', '-p', str(pid)], stdout=subprocess.DEVNULL).returncode != 0, pid
for pid in [660, 669]:
    assert subprocess.run(['ps', '-p', str(pid)], stdout=subprocess.DEVNULL).returncode == 0, pid

cleanup = {'start': stamp(), 'ownedServicesAlreadyGracefullyStopped': owned_pids,
           'lightweightAgents': {'institution_inventory': 'completed, idle', 'web_inventory': 'completed, idle', 'runtime_inventory': 'stopped after usage-limit failure; primary completed remaining verification'},
           'heavyAgentsUsed': False, 'unrelatedPostgresRedisUntouched': [669, 660], 'userOwnedChatsAltered': False,
           'temporaryFilesystem': {'creation': ['hdiutil', 'create', '-size', '4g', '-type', 'SPARSEBUNDLE', '-fs', 'APFS', '-volname', 'PetrosPhase4Verification', '/Volumes/Chris/.petros-phase4-tmp-01a0fb94/verification.sparsebundle'], 'mount': '/Volumes/PetrosPhase4Verification'}}
command = ['hdiutil', 'detach', '/Volumes/PetrosPhase4Verification']
result = subprocess.run(command, capture_output=True, text=True)
cleanup['detach'] = {'command': command, 'exitCode': result.returncode, 'output': result.stdout + result.stderr}
assert result.returncode == 0, cleanup['detach']
temporary = pathlib.Path('/Volumes/Chris/.petros-phase4-tmp-01a0fb94')
shutil.rmtree(temporary)
removed = [str(temporary)]
for name in ['petros-phase4-browser.json', 'petros-phase4-fixture-control.json', 'petros-phase4-fixture-control-ack.json', 'petros-phase4-institution-web.log', 'petros-phase4-provider-capture.json', 'petros-phase4-server-summary.json']:
    path = pathlib.Path('/tmp') / name
    path.unlink(missing_ok=True)
    removed.append(str(path))
cleanup.update(removedTaskOwnedPaths=removed, end=stamp(), privateFixtureProcessesRemaining=False)
(out / 'final-cleanup.json').write_text(json.dumps(cleanup, indent=2) + '\n')

paths = [out / 'command-index.json', out / 'browser-journey.json', out / 'frozen-r2-server-summary.json', out / 'integrated-journey.md', out / 'final-cleanup.json', out / 'frozen-r2-institution-browser.log']
paths += [out / name / 'identity.json' for name in ['frozen-final-r2', 'verified-final-r2', 'closing-final-r2']]
paths += [out / (r['name'] + ext) for r in index['commands'] for ext in ['.json', '.log']]
paths += [out / name for name in ['browser-notebook-review-flow.png', 'browser-continuity-next-day-mobile.png', 'browser-continuity-memory-mobile.png', 'browser-continuity-offline-sync.png', 'browser-low-bandwidth-optional-visual.png', 'browser-teacher-correction-reviewed.png', 'browser-teacher-intervention-reviewed-cancelled.png']]
paths += [root / 'docs' / name for name in ['PETROS-PHASE-4-VERIFICATION-RESULTS.md', 'PETROS-LEARNING-HARNESS-PLAN.md']]
manifest = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root)}\n' for path in sorted(set(paths)))
(out / 'final-artifact-sha256.txt').write_text(manifest)
print(json.dumps({'status': 'PASS', 'sourceManifestSha256': frozen['sourceManifestSha256'], 'indexedCommands': len(index['commands']), 'artifactFiles': len(set(paths)), 'cleanup': 'complete'}))
