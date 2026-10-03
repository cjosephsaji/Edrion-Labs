import hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile
root=pathlib.Path('/Volumes/Chris/Edrion Labs'); app=sys.argv[1]
if app not in ['student-web','institution-web','super-admin-web']:raise SystemExit('Unsupported app')
source=root/'apps'/app; temporary_root=pathlib.Path('/Volumes/Chris/.petros-phase6-tmp-01a10162'); temporary_root.mkdir(exist_ok=True)
temporary=pathlib.Path(tempfile.mkdtemp(prefix='petros-phase6-build-',dir=temporary_root)); copied=temporary/'apps'/app

def ignore(directory,names):
 return [name for name in names if name=='node_modules' or name.startswith('.env') or name.startswith('.next') or name.startswith('._') or name.endswith('.tsbuildinfo') or name=='.turbo']
try:
 shutil.copytree(source,copied,ignore=ignore,copy_function=shutil.copyfile)
 (copied/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
 (temporary/'packages').symlink_to(root/'packages',target_is_directory=True)
 files=[path for path in copied.rglob('*') if path.is_file() and 'node_modules' not in path.parts and not path.name.startswith('._')]
 rows=[]
 for path in files:
  rel=path.relative_to(copied); original=source/rel
  digest=hashlib.sha256(path.read_bytes()).hexdigest()
  assert digest==hashlib.sha256(original.read_bytes()).hexdigest(),rel
  rows.append((str(rel),digest))
 env={key:os.environ[key] for key in ['PATH','LANG','USER','TMPDIR'] if key in os.environ}
 env.update({'HOME':str(temporary),'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1','PETROS_ISOLATED_VERIFICATION':'1','NEXT_PUBLIC_API_BASE_URL':'http://127.0.0.1:3417'})
 print(json.dumps({'copiedSourceFiles':len(rows),'copyManifestSha256':hashlib.sha256(json.dumps(sorted(rows)).encode()).hexdigest(),'rootOrAppEnvLoaded':False,'isolatedOutput':True}),flush=True)
 if (copied/'scripts/gen-tokens.ts').exists():
  result=subprocess.run([str(source/'node_modules/.bin/tsx'),'scripts/gen-tokens.ts'],cwd=copied,env=env)
  if result.returncode:raise SystemExit(result.returncode)
 result=subprocess.run([str(source/'node_modules/.bin/next'),'build'],cwd=copied,env=env)
 raise SystemExit(result.returncode)
finally:
 shutil.rmtree(temporary)
