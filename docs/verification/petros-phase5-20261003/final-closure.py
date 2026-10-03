import pathlib,subprocess,sys
root=pathlib.Path('/Volumes/Chris/Edrion Labs'); d=root/'docs/verification/petros-phase5-20261003'
runner=[sys.executable,str(d/'run-command.py')]
def run(name,*cmd):
 result=subprocess.run(runner+['final-r5-'+name.removeprefix('final-'),*cmd],cwd=root)
 if result.returncode:sys.exit(result.returncode)
run('final-environment','python3','-c',"import platform,subprocess;print(platform.platform());print(subprocess.check_output(['df','-h','/private/tmp','/Volumes/Chris']).decode());print(subprocess.check_output(['node','--version']).decode());print(subprocess.check_output(['pnpm','--version']).decode());print(subprocess.check_output(['pg_config','--version']).decode());print(subprocess.check_output(['redis-server','--version']).decode())")
api_paths=['src/modules/student/petros-session-intent','src/modules/student/materials','src/modules/student/knowledge','src/modules/student/petros-loop','src/modules/student/petros-input-modes','src/modules/student/petros-companion','src/modules/student/petros-artifacts','src/modules/student/petros-reflection','src/modules/petros-ai-routing','src/modules/petros-learner-model','src/modules/petros-institutional','src/modules/petros-topic-profiles','src/modules/integrations','src/modules/federation','src/modules/portal/courses','src/modules/student/courses','src/common','src/modules/student/petros-continuity','src/modules/student/assignments','src/modules/portal/course-content','src/modules/portal/assignments','src/modules/petros-quality']
run('final-api','env','PETROS_PHASE5_QUALITY_ARTIFACT='+str(d/'production-quality-performance-final.json'),'pnpm','--filter','@edrion/api','exec','vitest','run',*api_paths,'--pool=forks','--poolOptions.forks.singleFork=true','--testTimeout=30000')
run('final-schema-student-tests','pnpm','--filter','@edrion/schemas','--filter','@edrion/student-web','test')
packages=['schemas','config','database','api','student-web','institution-web','super-admin-web','learn-evals']
filters=sum((['--filter','@edrion/'+p] for p in packages),[])
run('final-typechecks','pnpm',*filters,'typecheck')
run('final-lint','pnpm',*filters[:-2],'lint') # learn-evals has no lint script
run('final-eval-fixtures','pnpm','--filter','@edrion/learn-evals','check-fixtures')
run('final-eval-tests','pnpm','--filter','@edrion/learn-evals','test')
run('final-eval-corpus','pnpm','--filter','@edrion/learn-evals','exec','tsx','src/cli.ts','run','--suite','full','--mode','fixture','--run-id','phase5-20261003-frozen-r5')
run('final-relocate-corpus','python3','-c',"import pathlib,shutil; source=pathlib.Path('packages/learn-evals/eval-runs/petros-quality'); target=pathlib.Path('docs/verification/petros-phase5-20261003/legacy-quality-corpus-r5');target.mkdir(exist_ok=True); paths=list(source.glob('phase5-20261003-frozen-r5*'));assert len(paths)==4;manifest=pathlib.Path('docs/verification/petros-phase5-20261003/frozen-final-r5/source-sha256.txt').read_text();assert all(str(p) not in manifest for p in paths);[(shutil.copyfile(p,target/p.name),None if (target/p.name).read_bytes()==p.read_bytes() else (_ for _ in ()).throw(AssertionError(str(p))),p.unlink()) for p in paths];print('Four task-owned corpus outputs preserved in dated evidence; implementation files unchanged.')")
run('final-api-build','pnpm','--filter','@edrion/api','build')
for app in ['student-web','institution-web','super-admin-web']:
 run('final-'+app+'-build','python3',str(d/'build-isolated-web.py'),app)
run('final-diff-check','git','diff','--check')
