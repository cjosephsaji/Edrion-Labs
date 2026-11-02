from pathlib import Path
import subprocess,os,shutil,json,struct
ROOT=Path(__file__).resolve().parents[1];PUB=ROOT/'public/world-v3';RAW=ROOT/'art/exports';RAW.mkdir(exist_ok=True)
env=os.environ.copy();ktx_bin=env.get('PETROS_KTX_BIN')
if ktx_bin:env['PATH']=ktx_bin+os.pathsep+env['PATH']
cli=ROOT/'node_modules/.bin/gltf-transform'
def run(*args):
 r=subprocess.run([str(cli),*map(str,args)],cwd=ROOT,env=env,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr+'\n'+r.stdout)
for name in ['archipelago','petros','rocket','car','ship','word','light-clock','node','cloud','planet']:
 source=PUB/(name+'.glb');shutil.copyfile(source,RAW/(name+'.glb'));tmp=Path('/tmp')/('petros-'+name+'-mesh.glb')
 run('optimize',source,tmp,'--compress','meshopt','--texture-compress','false','--simplify','false')
 b=source.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);has=bool(j.get('textures'))
 if has:
  run('uastc',tmp,source,'--level','2','--zstd','18','--jobs','2')
  low=Path('/tmp')/('petros-'+name+'-low.glb');run('resize',tmp,low,'--width','1024','--height','1024');run('uastc',low,PUB/(name+'-low.glb'),'--level','2','--zstd','18','--jobs','2')
 else:shutil.copyfile(tmp,source)
 # Texture transforms decode Meshopt; re-apply it last so both extensions survive.
 for final in [source]+([PUB/(name+'-low.glb')] if has else []):
  compressed=Path('/tmp')/('petros-final-'+final.name);run('meshopt',final,compressed,'--level','high');shutil.copyfile(compressed,final)
 print('PREPARED',name,source.stat().st_size,flush=True)
