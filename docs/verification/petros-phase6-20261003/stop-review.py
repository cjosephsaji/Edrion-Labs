"""Stop only confirmed Phase6 synthetic review resources. Run when review is finished."""
import os,signal,subprocess,time,json,pathlib
root=pathlib.Path('/Volumes/Chris/Edrion Labs');d=root/'docs/verification/petros-phase6-20261003';stopped=[]
for port,marker in [(3417,'src/modules/integrations/petros-phase6-browser-server.ts'),(3422,'docs/verification/petros-phase6-20261003/review-gateway.py')]:
 ids=subprocess.run(['lsof','-iTCP:'+str(port),'-sTCP:LISTEN','-t'],capture_output=True,text=True).stdout.split()
 for value in ids:
  cmd=subprocess.check_output(['ps','-p',value,'-o','command=']).decode().strip()
  assert marker in cmd,'Refuse stopping unrelated listener on '+str(port)
  os.kill(int(value),signal.SIGTERM);stopped.append({'pid':int(value),'port':port,'command':cmd})
lines=subprocess.check_output(['ps','-ax','-o','pid=,command=']).decode().splitlines()
for line in lines:
 pid,command=line.strip().split(None,1)
 if 'run-command.py' in command:continue
 if command.endswith('docs/verification/petros-phase6-20261003/run-isolated-student-web.py') or command.endswith('docs/verification/petros-phase6-20261003/run-isolated-portal-web.py institution-web'):
  os.kill(int(pid),signal.SIGTERM);stopped.append({'pid':int(pid),'command':command})
time.sleep(2)
metadata=pathlib.Path('/tmp/petros-phase6-browser.json')
if metadata.exists():
 m=json.loads(metadata.read_text());assert m['phase']=='P6' and m['cohortKind']=='disposable-synthetic';metadata.unlink()
summary=pathlib.Path('/tmp/petros-phase6-server-summary.json')
if summary.exists():(d/'final-review-server-summary.json').write_bytes(summary.read_bytes())
(d/'review-stop.json').write_text(json.dumps({'stopped':stopped,'sharedServices':'untouched'},indent=2)+'\n');print('Stopped confirmed task-owned review resources:',len(stopped))
