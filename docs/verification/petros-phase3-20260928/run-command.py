import datetime,json,os,pathlib,subprocess,sys,time
root=pathlib.Path('/Volumes/Chris/Edrion Labs'); out=root/'docs/verification/petros-phase3-20260928'
name=sys.argv[1]; command=sys.argv[2:]; start=datetime.datetime.now(datetime.timezone.utc).isoformat()
env=os.environ.copy(); env['PETROS_LOCAL_DB_TESTS']='1'
with (out/(name+'.log')).open('w') as log:
 log.write(json.dumps({'command':command,'start':start,'overrides':{'PETROS_LOCAL_DB_TESTS':'1'}})+'\n'); log.flush()
 result=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 end=datetime.datetime.now(datetime.timezone.utc).isoformat(); log.write('\n'+json.dumps({'exitCode':result.returncode,'end':end})+'\n')
record={'command':command,'start':start,'end':end,'exitCode':result.returncode,'overrides':{'PETROS_LOCAL_DB_TESTS':'1'}}
(out/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n'); print(json.dumps(record)); sys.exit(result.returncode)
