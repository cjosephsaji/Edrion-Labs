import bpy,json
from mathutils import Vector
from pathlib import Path
out=[]
for o in bpy.data.objects:
 if o.type=='MESH':
  points=[o.matrix_world@Vector(p) for p in o.bound_box]
  out.append({'name':o.name,'location':list(o.location),'dimensions':list(o.dimensions),'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)],'vertices':len(o.data.vertices),'materials':[m.name if m else '' for m in o.data.materials],'library':o.library.filepath if o.library else None})
print('SCENES',[(s.name,len(s.objects)) for s in bpy.data.scenes])
p=Path('/Volumes/Chris/Edrion Labs/prototype/assets/realism/metadata/classroom-inspection.json');p.write_text(json.dumps(out,indent=2))
print('MESHES',len(out))
for o in out:
 if o['library'] is None:print(o['name'],[round(x,2) for x in o['dimensions']],o['materials'])
