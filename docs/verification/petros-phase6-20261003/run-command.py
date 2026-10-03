import datetime,json,os,pathlib,subprocess,sys,time
root=pathlib.Path('/Volumes/Chris/Edrion Labs'); out=root/'docs/verification/petros-phase6-20261003'
name=sys.argv[1]; command=sys.argv[2:]; start=datetime.datetime.now(datetime.timezone.utc).isoformat()
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','USER','LANG','TMPDIR','PETROS_PHASE5_QUALITY_ARTIFACT','PETROS_ISOLATED_VERIFICATION','NEXT_PUBLIC_API_BASE_URL']}; env['PETROS_LOCAL_DB_TESTS']='1'
overrides={'PETROS_LOCAL_DB_TESTS':'1'}
if 'TMPDIR' in env: overrides['TMPDIR']=env['TMPDIR']
with (out/(name+'.log')).open('w') as log:
 log.write(json.dumps({'command':command,'start':start,'overrides':overrides})+'\n'); log.flush()
 result=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 end=datetime.datetime.now(datetime.timezone.utc).isoformat(); log.write('\n'+json.dumps({'exitCode':result.returncode,'end':end})+'\n')
record={'command':command,'start':start,'end':end,'exitCode':result.returncode,'overrides':overrides}
(out/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n'); print(json.dumps(record)); sys.exit(result.returncode)
