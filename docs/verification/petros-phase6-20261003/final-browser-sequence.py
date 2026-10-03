import pathlib,subprocess,sys,json
root=pathlib.Path('/Volumes/Chris/Edrion Labs');d=root/'docs/verification/petros-phase6-20261003';records=[]
for engine,kind in [('chromium','baseline'),('chromium','capabilities'),('webkit','baseline'),('webkit','capabilities'),('firefox','baseline')]:
 name='final-r6-'+engine+'-'+('journey' if kind=='baseline' else kind)
 code=subprocess.run([sys.executable,str(d/'run-browser-stage.py'),name,engine,kind],cwd=root).returncode
 records.append({'name':name,'engine':engine,'kind':kind,'exitCode':code});(d/'final-browser-sequence.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records))
