import hashlib,json,os,pathlib,shutil,signal,subprocess,tempfile
root=pathlib.Path('/Volumes/Chris/Edrion Labs');source=root/'apps/student-web'
base=pathlib.Path('/Volumes/Chris/.petros-phase5-tmp-01a0fb94');base.mkdir(exist_ok=True)
temp=pathlib.Path(tempfile.mkdtemp(prefix='petros-phase5-student-web-',dir=base));copied=temp/'apps/student-web';proc=None;requested_stop=False
try:
 shutil.copytree(source,copied,ignore=lambda d,n:[x for x in n if x=='node_modules' or x.startswith(('.env','.next','._')) or x.endswith('.tsbuildinfo') or x=='.turbo'],copy_function=shutil.copyfile)
 (copied/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
 rows=[(str(p.relative_to(copied)),hashlib.sha256(p.read_bytes()).hexdigest()) for p in copied.rglob('*') if p.is_file() and 'node_modules' not in p.parts]
 print(json.dumps({'copiedSourceFiles':len(rows),'copyManifestSha256':hashlib.sha256(json.dumps(sorted(rows)).encode()).hexdigest(),'rootOrAppEnvLoaded':False}),flush=True)
 env={k:os.environ[k] for k in ['PATH','LANG','USER'] if k in os.environ}
 env.update(HOME=str(temp),TMPDIR=str(temp),NODE_ENV='production',NEXT_TELEMETRY_DISABLED='1',PETROS_ISOLATED_VERIFICATION='1',NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:3417',NEXT_PUBLIC_DEV_STUDENT_EMAIL='',NEXT_PUBLIC_DEV_STUDENT_USER='')
 build_command=[str(source/'node_modules/.bin/next'),'build']
 print(json.dumps({'nestedCommand':build_command,'cwd':str(copied),'environment':'isolated_production'}),flush=True)
 build_result=subprocess.run(build_command,cwd=copied,env=env)
 print(json.dumps({'buildExitCode':build_result.returncode}),flush=True)
 if build_result.returncode:raise SystemExit(build_result.returncode)
 start_command=[str(source/'node_modules/.bin/next'),'start','-p','3421','-H','127.0.0.1']
 print(json.dumps({'nestedCommand':start_command,'cwd':str(copied)}),flush=True)
 proc=subprocess.Popen(start_command,cwd=copied,env=env)
 def close(sig,frame):
  global requested_stop
  requested_stop=True
  proc.terminate()
 signal.signal(signal.SIGTERM,close);signal.signal(signal.SIGINT,close)
 print(json.dumps({'pid':proc.pid,'isolatedDirectory':str(temp),'rootEnvLoaded':False}),flush=True)
 result=proc.wait()
 raise SystemExit(0 if requested_stop else result)
finally:
 if proc and proc.poll() is None:proc.terminate();proc.wait(timeout=10)
 shutil.rmtree(temp)
