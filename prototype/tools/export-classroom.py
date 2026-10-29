import bpy,json,math,bmesh
from pathlib import Path
from mathutils import Matrix
ROOT=Path('/Volumes/Chris/Edrion Labs/prototype/assets/realism');scene=bpy.data.scenes['_mainScene'];bpy.context.window.scene=scene
for name in ['woodFloor','beigeWall','woodPlanks','whitePaintedWindow','boardFrame','paintedCeiling','plaster']:
 m=bpy.data.materials.get(name)
 if m: print('MATERIAL',name,[(n.type,n.name,n.image.name if n.type=='TEX_IMAGE' and n.image else '') for n in m.node_tree.nodes])
# Copy evaluated source meshes, applying their authored world transforms; no replacement modeling.
room=[];frame=[]
for o in list(scene.objects):
 if o.type!='MESH' or o.library:continue
 name=o.name
 keep=name.startswith(('wall','woodBase','woodWindow','ceiling','beams','pipe','verticalPipe')) and name not in ['wall','wall.011','wall.001','wall.002','wall.003','wall.004','ceilingWithHole']
 # Keep the window-wall piers; remove only the internal corridor partition.
 if name in ['wall.001','wall.002','wall.003','wall.004']:keep=True
 if name.startswith('wallPlug') or name.startswith('wallSwitch'):keep=True
 if name in ['sol','windows']:keep=True
 isframe=name in ['boardFrame','blackBoard_upPart','blackBoardLamp','blackboardLamp']
 if not keep and not isframe:continue
 mesh=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()),depsgraph=bpy.context.evaluated_depsgraph_get());mesh.transform(o.matrix_world)
 # Remove authored wainscot/trim faces belonging to the removed corridor partition.
 if keep and name.startswith(('woodBase','ceilingMoulding','wallPlug','wallSwitch')):
  bm=bmesh.new();bm.from_mesh(mesh)
  remove=[f for f in bm.faces if all(-2.85 < v.co.x < -2.20 for v in f.verts)]
  bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(mesh);bm.free()
 if name=='windows':
  glass=bpy.data.materials.new('Petros_authored_window_glass');glass.use_nodes=True
  bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.94,.97,1,1);bs.inputs['Roughness'].default_value=.06;bs.inputs['Transmission Weight'].default_value=.8;bs.inputs['IOR'].default_value=1.45
  glass['petros_converted']=True;mesh.materials.clear();mesh.materials.append(glass)
 if name in ['wall.009','wall.005']:
  mesh.materials.clear();mesh.materials.append(bpy.data.materials['beigeWall'])
 n=bpy.data.objects.new(name+'__export',mesh);scene.collection.objects.link(n)
 for m in n.data.materials:
  if not m:continue
  if m.get('petros_converted'):continue
  m.use_nodes=True;nodes=m.node_tree.nodes;images=[(node.image,node.name) for node in nodes if node.type=='TEX_IMAGE' and node.image]
  diffuse=m.diffuse_color[:];old=m.name.lower();nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');bs=nodes.new('ShaderNodeBsdfPrincipled');m.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface']);bs.inputs['Base Color'].default_value=diffuse;bs.inputs['Roughness'].default_value=.82
  if 'paint' in old or 'wall' in old:bs.inputs['Base Color'].default_value=(.72,.70,.64,1)
  if 'plaster' in old:bs.inputs['Base Color'].default_value=(.8,.79,.74,1)
  if 'glass' in old:bs.inputs['Base Color'].default_value=(.64,.77,.8,1);bs.inputs['Roughness'].default_value=.16
  if 'metal' in old or 'pipe' in old:bs.inputs['Metallic'].default_value=.55;bs.inputs['Roughness'].default_value=.35
  if images:
   # Choose original authored color image, never the AO-only image as albedo.
   chosen=next((im for im,node in images if 'base_wallPaint' in im.name),None) if ('wall' in old or 'ceiling' in old) else None
   if not chosen:chosen=next((im for im,node in images if not any(t in im.name.lower() for t in ['_ao','normal','bump','mask'])),None)
   if chosen:
    tex=nodes.new('ShaderNodeTexImage');tex.image=chosen;m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
  if 'paintedpipe' in old.lower():bs.inputs['Metallic'].default_value=0;bs.inputs['Roughness'].default_value=.8
  if old=='blackboardlight':bs.inputs['Emission Color'].default_value=(1,.88,.65,1);bs.inputs['Emission Strength'].default_value=1
  m['petros_converted']=True
 if keep:
  # Translation only. glTF's standard Z-up→Y-up export handles the coordinate conversion.
  mesh.transform(Matrix.Translation((.955,.61,0)));room.append(n)
 else:frame.append(n)
export_scene=bpy.data.scenes.new('PetrosRoomExport')
for o in room:export_scene.collection.objects.link(o)
bpy.context.window.scene=export_scene
for o in room:o.select_set(True)
ROOT.joinpath('source/classroom-export').mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'source/classroom-export/classroom-shell.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_materials='EXPORT')
board_scene=bpy.data.scenes.new('PetrosBoardExport')
for o in frame:board_scene.collection.objects.link(o)
bpy.context.window.scene=board_scene
for o in frame:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'source/classroom-export/teaching-board.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False)
print('EXPORT_COUNTS',len(room),len(frame))
