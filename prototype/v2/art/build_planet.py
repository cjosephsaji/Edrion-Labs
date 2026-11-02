import bpy,math,random
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];random.seed(42)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,c):
 m=bpy.data.materials.new(name);m.diffuse_color=tuple(v/255 for v in c)+(1,);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.7;return m
sea=mat('matte azure',(63,119,141));land=mat('warm sage continents',(142,174,135));ice=mat('cream polar caps',(228,221,195));all=[]
bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=40,radius=1.3);sphere=bpy.context.object;sphere.data.materials.append(sea);all.append(sphere)
for lon,lat,sx,sy in [(-105,40,35,25),(-60,-12,16,30),(12,47,20,15),(20,3,22,30),(95,36,45,26),(137,-25,22,12),(-42,70,14,13)]:
 verts=[];r=1.318
 for ring in [0,1]:
  count=1 if ring==0 else 24
  for i in range(count):
   a=i*math.tau/count;dx=math.cos(a)*sx*(1+.15*math.sin(a*5));dy=math.sin(a)*sy*(1+.1*math.cos(a*3));lo=math.radians(lon+(dx if ring else 0));la=math.radians(lat+(dy if ring else 0));verts.append((r*math.cos(la)*math.cos(lo),r*math.cos(la)*math.sin(lo),r*math.sin(la)))
 faces=[(0,1+i,1+(i+1)%24) for i in range(24)];mesh=bpy.data.meshes.new('continent');mesh.from_pydata(verts,[],faces);mesh.materials.append(land);o=bpy.data.objects.new('modeled continent',mesh);bpy.context.collection.objects.link(o);all.append(o)
for sign in [-1,1]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1);o=bpy.context.object;o.scale=(.39,.39,.08);o.location.z=sign*1.25;o.data.materials.append(ice);all.append(o)
VM=bpy.data.materials.new('Planet vertex palette');VM.use_nodes=True;v=VM.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';VM.node_tree.links.new(v.outputs['Color'],VM.node_tree.nodes['Principled BSDF'].inputs['Base Color']);VM.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.7
bpy.ops.object.select_all(action='DESELECT')
for o in all:
 o.select_set(True);a=o.data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
 for d in a.data:d.color=o.data.materials[0].diffuse_color
 for p in o.data.polygons:p.use_smooth=True
 o.data.materials.clear();o.data.materials.append(VM)
bpy.context.view_layer.objects.active=all[0];bpy.ops.object.join();bpy.context.object.name='StylizedPlanet';bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/world-v3/planet.glb'),export_format='GLB',use_selection=True,export_animations=False)
