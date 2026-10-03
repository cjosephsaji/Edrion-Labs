import datetime,json,os,pathlib,subprocess,sys
root=pathlib.Path('/Volumes/Chris/Edrion Labs')
name=sys.argv[1];command=sys.argv[2:]
directory=root/'docs/verification/petros-phase2-20260922';directory.mkdir(parents=True,exist_ok=True)
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
env=os.environ.copy();env['NODE_OPTIONS']='--experimental-strip-types';env['PETROS_LOCAL_DB_TESTS']='1'
with (directory/(name+'.log')).open('w') as log:
    log.write(json.dumps({'startedAt':started,'cwd':str(root),'command':command,'environmentOverrides':{'NODE_OPTIONS':env['NODE_OPTIONS'],'PETROS_LOCAL_DB_TESTS':'1'}})+'\n');log.flush()
    result=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
    finished=datetime.datetime.now(datetime.timezone.utc).isoformat()
    record={'startedAt':started,'finishedAt':finished,'command':command,'exitCode':result.returncode,'log':name+'.log'}
    log.write('\n'+json.dumps(record)+'\n')
(directory/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record));print((directory/(name+'.log')).read_text()[-11000:]);sys.exit(result.returncode)
