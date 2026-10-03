"""Replay the recorded closure against a new frozen identity; retain every exact result."""
import concurrent.futures,json,pathlib,subprocess,sys
root=pathlib.Path('/Volumes/Chris/Edrion Labs')
base=root/'docs/verification/petros-phase2-20260922'
prefix=sys.argv[1]
records=json.loads((base/'historical-r4/final-command-results.json').read_text())['records']
api=[r for r in records if 'api-closure' in r['name']]
checks=[r for r in records if r not in api]
# Typechecks precede corresponding builds; full tests and browser checks are independent.
checks.sort(key=lambda r: (2 if '-build-' in r['name'] else 1 if '-diff-check-' in r['name'] else 0,r['name']))
def run(group):
    outcomes=[]
    for record in group:
        name=record['name'].replace('final-r4',prefix).replace('20260925','20260926')
        result=subprocess.run([sys.executable,str(base/'command-runner.py'),name,*record['command']],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
        path=base/(name+'.json')
        item=json.loads(path.read_text()) if path.exists() else {'exitCode':result.returncode,'error':result.stdout[-3000:]}
        outcomes.append({'name':name,**item})
        print(json.dumps({'name':name,'exitCode':item['exitCode']}),flush=True)
    return outcomes
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    groups=[checks] if '--checks-only' in sys.argv else [api,checks]
    futures=[pool.submit(run,group) for group in groups]
    outcomes=[item for future in futures for item in future.result()]
(base/(prefix+'-closure-results.json')).write_text(json.dumps(outcomes,indent=2)+'\n')
sys.exit(1 if any(record['exitCode']!=0 for record in outcomes) else 0)
