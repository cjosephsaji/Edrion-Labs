import datetime, hashlib, json, os, pathlib, shutil, subprocess

root = pathlib.Path('/Volumes/Chris/Edrion Labs')
base = root/'docs/verification/petros-phase5-20261003'
runtimes = [pathlib.Path('/private/tmp/petros-phase5-browsers-20261003-01a0fb94'),
            pathlib.Path('/Volumes/Chris/.petros-phase5-browsers-20261003')]
temporary = pathlib.Path('/Volumes/Chris/.petros-phase5-tmp-01a0fb94')
metadata = [pathlib.Path('/tmp')/name for name in [
    'petros-phase5-server-summary.json', 'petros-phase5-fixture-control.json',
    'petros-phase5-institution-web.log', 'petros-phase5-super-admin-web.log',
    'petros-phase5-provider-capture.json', 'petros-phase5-browser.json',
    'petros-phase5-fixture-control-ack.json']]
for name in ['final-r5-student-production-server', 'final-r5-chromium-production-server', 'final-r5-webkit-production-server']:
    assert json.loads((base/(name+'.json')).read_text())['exitCode'] == 0
for engine in ['chromium', 'webkit']:
    assert json.loads((base/'browser'/engine/'petros-phase5-server-summary.json').read_text())['closedAt']
rows = subprocess.check_output(['ps','-axo','pid,ppid,command'], text=True).splitlines()
active = [row for row in rows if any(s in row for s in [str(p) for p in runtimes]+[str(temporary),
          'src/modules/integrations/petros-phase5-browser-server.ts', 'run-isolated-student-web.py', 'build-isolated-web.py'])]
assert not active, active
removed = []
for p in metadata:
    if p.exists():
        assert p.is_file() and not p.is_symlink(), str(p)
        removed.append({'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                        'purpose':'task-created synthetic fixture metadata/control/log; final browser logs and summaries retained in dated evidence'})
        p.unlink()
for p in runtimes:
    if p.exists():
        assert p.is_dir() and not p.is_symlink(), str(p)
        removed.append({'path':str(p),'purpose':'task-owned downloaded/copied Playwright runtime; binary identities and launch logs retained'})
        shutil.rmtree(p)
if temporary.exists():
    # Build helpers removed their own working trees in finally blocks. Only
    # external-volume AppleDouble metadata may remain; never delete other files.
    remaining = list(temporary.iterdir())
    assert all(p.is_file() and p.name.startswith('._petros-phase5-') for p in remaining), [str(p) for p in remaining]
    for p in remaining: p.unlink()
    temporary.rmdir()
    removed.append({'path':str(temporary),'purpose':'empty task-owned build parent and its task-created AppleDouble metadata'})
after = subprocess.check_output(['ps','-axo','pid,ppid,command'], text=True).splitlines()
shared = [r.strip() for r in after if '/opt/homebrew/opt/redis/bin/redis-server 127.0.0.1:6379' in r
          or '/opt/homebrew/opt/postgresql@15/bin/postgres -D /opt/homebrew/var/postgresql@15' in r]
task_services = [r for r in after if 'petros-phase2-test-' in r or 'petros-p5-redis-' in r]
assert not task_services, task_services
record = {'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'removed':removed,
          'taskServicesRemaining':task_services, 'sharedServicesPreserved':shared,
          'disk':subprocess.check_output(['df','-h','/private/tmp','/Volumes/Chris'], text=True),
          'note':'No shared service stopped, no protected dump or workspace source removed. No system clock/security settings changed. Synthetic metadata values are not printed.'}
(base/'cleanup-record.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'removedPaths':len(removed),'taskServicesRemaining':len(task_services),'sharedServicesPreserved':len(shared),'disk':record['disk']}))
