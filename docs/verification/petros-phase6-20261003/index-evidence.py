import pathlib,json,hashlib,datetime,subprocess
root=pathlib.Path('/Volumes/Chris/Edrion Labs');p=root/'docs/verification/petros-phase6-20261003'
final=json.loads((p/'closing-final-r6/identity.json').read_text())
labels=['environment','api','schema-student-tests','typechecks','lint','eval-fixtures','eval-tests','eval-corpus','relocate-corpus','api-build','student-web-build','institution-web-build','super-admin-web-build','diff-check']
commands=[{'record':'final-r6-'+x+'.json','log':'final-r6-'+x+'.log',**json.loads((p/('final-r6-'+x+'.json')).read_text())} for x in labels]
assert all(x['exitCode']==0 for x in commands)
files=[];live=['final-r6-student-runtime.log','final-r4-institution-runtime.log','final-r6c-review-server.log','final-review-gateway.log']
for f in sorted(p.rglob('*')):
 if not f.is_file() or f.name.startswith('._') or f.name=='artifact-index.json':continue
 rel=str(f.relative_to(p));files.append({'path':rel,'bytes':f.stat().st_size,'sha256':None if rel in live else hashlib.sha256(f.read_bytes()).hexdigest(),'status':'live_review_log' if rel in live else 'recorded_artifact'})
records=[]
for port in [3417,3421,3422,3423]:
 for pid in subprocess.run(['lsof','-iTCP:'+str(port),'-sTCP:LISTEN','-t'],capture_output=True,text=True).stdout.split():
  command=subprocess.check_output(['ps','-p',pid,'-o','command=']).decode().strip();records.append({'port':port,'pid':int(pid),'command':command})
(p/'active-review-runtimes.json').write_text(json.dumps({'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'services':records,'purpose':'Local disposable synthetic review only','defaultProductAdmissions':'off','stopCommand':'python3 docs/verification/petros-phase6-20261003/stop-review.py'},indent=2)+'\n')
# Rehash the refreshed runtime inventory.
for row in files:
 if row['path']=='active-review-runtimes.json':row['sha256']=hashlib.sha256((p/row['path']).read_bytes()).hexdigest();row['bytes']=(p/row['path']).stat().st_size
index={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':'P6 synthetic engineering','finalIdentity':final,'finalCommands':commands,'browserEvidence':{engine:{'journey':'browser/'+engine+'/browser-journey.json','capabilities':'capabilities/'+engine+'/report.json','journeyCheckpoints':63,'capabilityChecks':10,'pageErrors':0} for engine in ['chromium','webkit']},'blocked':{'R1':'Firefox151/Playwright1532 launch fails before page creation on Darwin27','record':'final-r6-firefox-journey.json','rawLog':'final-r6-firefox-journey.log'},'capture':{'record':'final-r6c-screenshot-capture.json','report':'final-screenshots/report.json','images':20,'overflowChecks':10},'privacy':'Private synthetic session metadata/cookies remain only in /tmp; not copied into evidence. No real pilot/data/contact/paid calls.','reviewServices':records,'liveLogPolicy':'Live review logs are recorded with no frozen hash because they continue during user review.','files':files}
(p/'artifact-index.json').write_text(json.dumps(index,indent=2)+'\n');print('Indexed',len(files),'artifacts; final command groups',len(commands))
