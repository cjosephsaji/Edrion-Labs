import pathlib,subprocess,sys,time,os,json,signal
root=pathlib.Path('/Volumes/Chris/Edrion Labs'); d=root/'docs/verification/petros-phase6-20261003'; name=sys.argv[1];engine=sys.argv[2];kind=sys.argv[3]
runner=[sys.executable,str(d/'run-command.py')]; server=subprocess.Popen(runner+[name+'-server','pnpm','--filter','@edrion/api','exec','ts-node','src/modules/integrations/petros-phase6-browser-server.ts'],cwd=root)
try:
 for _ in range(180):
  if server.poll() is not None:raise RuntimeError('Synthetic server exited')
  log=d/(name+'-server.log')
  if log.exists() and '"status":"ready"' in log.read_text():break
  time.sleep(1)
 else:raise RuntimeError('Synthetic server readiness timeout')
 script='petros-phase6-capability-journey.mjs' if kind in ['capabilities','teacher'] else 'petros-phase6-browser-journey.mjs'
 command=['env','PETROS_PHASE6_BROWSER_ENGINE='+engine,'PLAYWRIGHT_BROWSERS_PATH=/private/tmp/petros-phase6-browsers-20261003-01a10162','PETROS_PHASE6_EXTERNAL_INSTITUTION_WEB=1']
 if kind=='teacher':command+=['PETROS_PHASE6_TEACHER_ONLY=1']
 result=subprocess.run(runner+[name,*command,'pnpm','--filter','@edrion/api','exec','node','src/modules/integrations/'+script],cwd=root)
 code=result.returncode
finally:
 ids=subprocess.check_output(['lsof','-iTCP:3417','-sTCP:LISTEN','-t']).decode().split()
 for pid in ids:
  command=subprocess.check_output(['ps','-p',pid,'-o','command=']).decode()
  if 'petros-phase6-browser-server.ts' not in command:raise RuntimeError('Refuse stopping unrelated API')
  os.kill(int(pid),signal.SIGTERM)
 server.wait(timeout=60)
 summary=pathlib.Path('/tmp/petros-phase6-server-summary.json')
 if summary.exists():(d/(name+'-server-summary.json')).write_bytes(summary.read_bytes())
sys.exit(code)
