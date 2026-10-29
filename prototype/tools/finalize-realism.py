"""Finalize inventory and cache versions from the actual runtime files."""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'assets'/'realism'
rows=json.loads((ROOT/'asset-register.json').read_text())
rows=[r for r in rows if r['id'] not in ['studio_small_03','spruit_sunrise']]
for id in ['studio_small_03','spruit_sunrise']:
 info=json.loads((ROOT/'metadata'/f'{id}.info.json').read_text())
 rows.append(dict(id=id,name=info['name'],creator=', '.join(info['authors']),source=f'https://polyhaven.com/a/{id}',license='CC0-1.0',licenseUrl='https://polyhaven.com/license',attributionRequired=False,sourceFormat='Radiance HDR (1K)',runtimeFormat='Radiance HDR (1K)',triangles=0,textures=[dict(name=id,size=[1024,512],mime='image/vnd.radiance')],intendedLocation='Window view' if id=='spruit_sunrise' else 'Indoor PBR environment'))
unused=['wooden_bookshelf_worn','mid_century_lounge_chair']
versions={}
for r in rows:
 file=r['id']+('.hdr' if r['triangles']==0 else '.glb');data=(ROOT/'runtime'/file).read_bytes()
 r.update(bytes=len(data),file='runtime/'+file,sha256=hashlib.sha256(data).hexdigest(),status='acquired candidate; not used in reference room' if r['id'] in unused else 'integrated in browser-verified reference room; awaiting owner visual approval')
 versions[file]=r['sha256'][:16]
(ROOT/'asset-register.json').write_text(json.dumps(rows,indent=2)+'\n')
(ROOT/'runtime-versions.json').write_text(json.dumps(versions,indent=2)+'\n')
text=['# Petros World asset register','', 'All imported assets are CC0; attribution is optional. Creator credits and direct sources are retained here. The reference room is awaiting visual approval.','', '| Asset / creator | Source | Triangles | Runtime MiB | Texture dimensions | Status |','| --- | --- | ---: | ---: | --- | --- |']
for r in rows:
 dims=', '.join(sorted(set(' × '.join(map(str,t['size']))for t in r['textures'])))
 text.append(f"| {r['name']} — {r['creator']} | [Source]({r['source']}) | {r['triangles']:,} | {r['bytes']/1048576:.2f} | {dims} | {r['status']} |")
text+=['','Original formats, converted formats, license links, file hashes and individual texture dimensions are recorded in [asset-register.json](asset-register.json).','', 'Classroom architecture and the physical board fixture are authored by Christophe Seux. The official [Blender demo files page](https://www.blender.org/download/demo-files/) labels Classroom CC0. Furniture, book and HDRI assets use [Poly Haven’s CC0 license](https://polyhaven.com/license). No remote asset API is called by the application.']
(ROOT/'ASSETS.md').write_text('\n'.join(text)+'\n')
