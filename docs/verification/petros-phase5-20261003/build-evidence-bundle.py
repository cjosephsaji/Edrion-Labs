import datetime,hashlib,json,pathlib
root=pathlib.Path('/Volumes/Chris/Edrion Labs');base=root/'docs/verification/petros-phase5-20261003'
identity=json.loads((base/'frozen-final-r5/identity.json').read_text())
manifest=[(line[66:],line[:64]) for line in (base/'frozen-final-r5/source-sha256.txt').read_text().splitlines()]
def digest(x):return hashlib.sha256(x).hexdigest()
def group(prefixes):
 rows=[(p,h) for p,h in manifest if any(p.startswith(prefix) for prefix in prefixes)]
 return {'sha256':digest(json.dumps(rows,separators=(',',':')).encode()),'files':len(rows),'manifest':rows}
def artifact(p):return {'path':str(p.relative_to(root)),'sha256':digest(p.read_bytes())}
required=['final-api','final-schema-student-tests','final-typechecks','final-lint','final-eval-fixtures','final-eval-tests','final-eval-corpus','final-api-build','final-student-web-build','final-institution-web-build','final-super-admin-web-build','final-diff-check','final-browser-chromium','final-browser-webkit']
commands=[]
for old_name in required:
 name='final-r5-'+old_name.removeprefix('final-')
 if old_name in ['final-browser-webkit','final-browser-chromium']:name+='-production'
 p=base/(name+'.json');r=json.loads(p.read_text());assert r['exitCode']==0,(name,r)
 commands.append({'name':name,**r,'commandRecord':artifact(p),'rawLog':artifact(base/(name+'.log'))})
quality=json.loads((base/'production-quality-performance-final.json').read_text())
browsers={}
for engine in ['chromium','webkit']:
 p=base/'browser'/engine/'browser-journey.json';r=json.loads(p.read_text());assert not r['errors'];assert all(c['passed'] for c in r['assertionCheckpoints'])
 browsers[engine]={'report':artifact(p),'environment':r['environment'],'checkpoints':len(r['assertionCheckpoints']),'pageErrors':len(r['errors'])}
bundle={'schemaVersion':'petros.phase5.evidence-bundle.v1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'purpose':'reviewable synthetic engineering evidence; not an activatable production release manifest','head':identity['head'],'branch':identity['branch'],'applicationSource':{'sha256':identity['sourceManifestSha256'],'files':identity['sourceManifestFileCount'],'manifest':artifact(base/'frozen-final-r5/source-sha256.txt')},'migrations':group(['packages/database/migrations/']),'promptSchema':group(['packages/schemas/src/petros-','apps/api/src/modules/petros-ai-routing/', 'apps/api/src/modules/student/petros-loop/']),'policyImplementation':group(['apps/api/src/modules/petros-institutional/','apps/api/src/modules/student/knowledge/','packages/config/']),'routingImplementation':group(['apps/api/src/modules/petros-ai-routing/']),'fixtureEvaluatorImplementation':group(['apps/api/src/modules/integrations/petros-phase5-','packages/learn-evals/']),'actualSyntheticOwnerIdentities':quality['identities'],'qualityPerformanceReport':artifact(base/'production-quality-performance-final.json'),'commands':commands,'browsers':browsers,'engineeringGates':{**{f'P5-E{i}':'pass' for i in range(1,9)},'P5-E9':'blocked_firefox_runtime; chromium_webkit_software_pass','P5-E10':'executed_closure_pass; firefox_runtime_journey_blocked'},'externalAcceptance':{'educator':'pending','canonicalCurriculum':'pending','consentPrivacyRetention':'pending','physicalDevicesAssistiveTechnologyHumanAccessibility':'pending','realPilotOutcomes':'pending','selectedConditionalCertification':'disabled_pending','executableIsolation':'disabled_pending'},'admissions':'disabled','instrumentation':'disabled except controlled disposable test fixture','productionReleaseConfiguration':'unconfigured; do not install fixture identities into a live environment','unavailableDependencies':{'R1':{'runtime':'Firefox151.0 Playwright1532 on Darwin27','status':'launch_timeout_before_page_creation','evidence':[artifact(base/n) for n in ['browser-apfs-smoke.log','browser-compatibility-smoke.log','browser-firefox-headed-smoke.log','final-r5-browser-firefox.log']] }},'deployment':'not_authorized','protectedHashes':identity['protectedHashes']}
(base/'engineering-release-bundle.json').write_text(json.dumps(bundle,indent=2)+'\n')
print(json.dumps({'bundle':str(base/'engineering-release-bundle.json'),'sha256':digest((base/'engineering-release-bundle.json').read_bytes()),'source':identity['sourceManifestSha256'],'commands':len(commands),'browsers':browsers},indent=2))
